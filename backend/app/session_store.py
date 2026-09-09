"""
app/session_store.py
=====================
The original `pipeline.py` is an interactive CLI script: it keeps all
intermediate stage results (detected lines, g-vectors, pairs, angle
rows, solve results, ...) as local Python variables while it runs.

A REST API is stateless request-by-request, so this module provides a
tiny in-memory session store that plays the same role: each browser
session accumulates pipeline state across the 9 stage endpoints,
exactly mirroring the data-flow documented in fileskh/pipeline_types.py.

This is intentionally simple (single-process, in-memory) since it is a
lightweight wrapper around the pipeline, not a new persistence layer.
For multi-worker / production deployments, swap this for Redis or a
database keyed the same way (the `SessionStore` interface below --
get / reset / touch -- is the seam to swap at).

Session lifecycle
------------------
- `session_id_from_header` is the single chokepoint every router calls
  to turn the client-supplied `X-Session-Id` header into a session key.
  It validates the id against a strict charset/length before it can
  ever be used to build a filesystem path (see app/paths.py's
  `session_output_dir`) -- this closes a path-traversal hole where a
  header like `X-Session-Id: ../../etc` would previously have been used
  verbatim as a directory name in Stage 9's CSV export and the
  session-clear endpoint's `shutil.rmtree`.
- Idle sessions expire automatically after `SESSION_TTL_SECONDS` of no
  activity, freeing their in-memory state and any exported CSV output
  under `backend/outputs/<session_id>/`. This is a lazy sweep (checked
  at most once every `_SWEEP_INTERVAL_SECONDS`), not a background
  thread -- simplest thing that avoids unbounded memory/disk growth
  for an app with no persistence layer.
- `SessionStore.reset()` (used by the `DELETE /api/session` endpoint)
  performs the same cleanup on demand, so a user isn't forced to wait
  for the idle timeout once they're done with their results.
"""

from __future__ import annotations

import logging
import re
import shutil
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from fastapi import HTTPException

from fileskh.pipeline_types import (
    AngleRow,
    ClassifyResult,
    DetectedLine,
    GVector,
    GVecSelection,
    LinePair,
    SolveResult,
    TrueLineResult,
)

from crystallography.models import BurgersCandidate, GBObservationInput

from .paths import session_output_dir


logger = logging.getLogger(__name__)

DEFAULT_SESSION = "default"

# Matches what the frontend actually generates (crypto.randomUUID(), or the
# `sess-<timestamp>-<random-hex>` fallback in lib/api.js's getSessionId()),
# with generous headroom for other safe clients. Deliberately excludes `.`,
# `/`, and `\` so a session id can never escape its own directory when used
# to build a filesystem path.
_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

# How long a session may sit idle before it's swept and its data (in-memory
# state + exported CSV) is freed. Generous for a research tool where a user
# may step away mid-analysis, short enough that abandoned sessions don't
# accumulate forever.
SESSION_TTL_SECONDS = 2 * 60 * 60  # 2 hours

# Sweeping is O(active sessions); throttled so a burst of requests doesn't
# repeat that scan on every single one.
_SWEEP_INTERVAL_SECONDS = 5 * 60  # 5 minutes


@dataclass
class PairGbState:
    """One pair's experimental g.b record -- see STAGE 7 REDESIGN /
    PROJECT DATA MODEL in the integration spec. `observations` is the
    experimental record (never overwritten by the solver); everything
    else here is *derived* from it on every submission.
    """
    pair_id: str
    observations: List[GBObservationInput] = field(default_factory=list)
    candidates: List[BurgersCandidate] = field(default_factory=list)
    resolved_burgers: Optional[List[float]] = None
    math_derivation: str = ""


@dataclass
class SessionState:
    # Stage 1
    lines_by_img: Dict[str, List[DetectedLine]] = field(default_factory=dict)
    gvecs_by_img: Dict[str, List[GVector]] = field(default_factory=dict)

    # Stage 3
    pairs: Dict[str, LinePair] = field(default_factory=dict)

    # Stage 4
    selections: List[GVecSelection] = field(default_factory=list)
    angle_rows: List[AngleRow] = field(default_factory=list)

    # Stage 6 -- keyed by (pair_id, image)
    solve_results: Dict[tuple, SolveResult] = field(default_factory=dict)

    # Stage 7 -- keyed by pair_id
    true_lines: Dict[str, TrueLineResult] = field(default_factory=dict)

    # Stage 8 -- keyed by pair_id
    classify_results: Dict[str, ClassifyResult] = field(default_factory=dict)

    # Stage 6/9 -- zone axes used per image, keyed by image basename
    zone_axes: Dict[str, List[float]] = field(default_factory=dict)

    # Stage 9
    burgers: Optional[List[float]] = None
    burgers_by_pair: Dict[str, List[float]] = field(default_factory=dict)

    # Stage 7 (frontend) / crystallography -- material selection and the
    # experimental g.b record per pair. `burgers` above is still set (now
    # automatically, from `resolved_burgers` below) once a pair's
    # observations resolve to exactly one crystallographically-consistent
    # candidate or the user confirms one among several -- see
    # app/routers/stage8_classify.py. It is never set by free-text entry
    # anymore.
    material_id: Optional[str] = None
    crystal_system: str = "cubic"
    c_over_a: Optional[float] = None
    gb_observations: Dict[str, "PairGbState"] = field(default_factory=dict)

    # Lifecycle bookkeeping (not part of the scientific pipeline data)
    created_at: float = field(default_factory=time.time)
    last_accessed: float = field(default_factory=time.time)

    def has_any_data(self) -> bool:
        """Whether this session holds anything beyond its empty defaults."""
        return bool(
            self.lines_by_img
            or self.gvecs_by_img
            or self.pairs
            or self.selections
            or self.angle_rows
            or self.solve_results
            or self.true_lines
            or self.classify_results
            or self.zone_axes
            or self.burgers is not None
            or self.burgers_by_pair
            or self.material_id is not None
            or self.crystal_system != "cubic"
            or self.c_over_a is not None
            or self.gb_observations
        )


def _remove_session_output_dir(session_id: str) -> bool:
    """Best-effort delete of a session's exported CSV directory, if any."""
    out_dir = session_output_dir(session_id)
    if not out_dir.exists():
        return False
    try:
        shutil.rmtree(out_dir, ignore_errors=True)
        return True
    except OSError:
        logger.exception("Failed to remove output directory for session %s", session_id)
        return False


class SessionStore:
    """Thread-safe registry of SessionState objects keyed by session id."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: Dict[str, SessionState] = {}
        self._last_swept = 0.0

    def get(self, session_id: str) -> SessionState:
        """Fetch (creating if needed) a session's state and mark it as just-used."""
        with self._lock:
            self._sweep_expired_locked()
            state = self._sessions.get(session_id)
            if state is None:
                state = SessionState()
                self._sessions[session_id] = state
            state.last_accessed = time.time()
            return state

    def reset(self, session_id: str) -> None:
        """Discard a session's in-memory state and on-disk output, immediately."""
        with self._lock:
            self._sessions.pop(session_id, None)
        _remove_session_output_dir(session_id)

    def active_session_count(self) -> int:
        with self._lock:
            self._sweep_expired_locked()
            return len(self._sessions)

    def session_age_seconds(self, session_id: str) -> Optional[float]:
        with self._lock:
            state = self._sessions.get(session_id)
            return None if state is None else time.time() - state.created_at

    def _sweep_expired_locked(self) -> None:
        """Evict idle sessions past SESSION_TTL_SECONDS. Caller holds self._lock."""
        now = time.time()
        if now - self._last_swept < _SWEEP_INTERVAL_SECONDS:
            return
        self._last_swept = now

        expired = [
            sid
            for sid, state in self._sessions.items()
            if now - state.last_accessed > SESSION_TTL_SECONDS
        ]
        for sid in expired:
            del self._sessions[sid]
            logger.info("Session '%s' expired after %.0fs idle; cleaning up.", sid, SESSION_TTL_SECONDS)
            _remove_session_output_dir(sid)


SESSIONS = SessionStore()


def session_id_from_header(x_session_id: Optional[str]) -> str:
    """Validate and normalize the client-supplied X-Session-Id header.

    This is the single point every router goes through before touching
    SessionStore or building any session-scoped filesystem path, so it's
    also the single point that needs to defend against a malformed or
    hostile header value (e.g. path-traversal sequences).
    """
    if x_session_id is None or x_session_id == "":
        return DEFAULT_SESSION
    if not _SESSION_ID_RE.match(x_session_id):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid X-Session-Id header. Expected 1-128 characters from "
                "[A-Za-z0-9_-]."
            ),
        )
    return x_session_id
