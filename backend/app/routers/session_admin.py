"""
app/routers/session_admin.py
=============================
User-facing session/cache control.

Raw uploaded images are already deleted immediately after Stage 1
processing (see stage1_detection.py) -- nothing is retained on disk from
an upload beyond the moment it's detected. What *does* persist for the
lifetime of a session is:

  - the in-memory pipeline results in SessionStore (detected lines,
    g-vectors, pairs, angle rows, solve/true-line/classify results), and
  - the exported `backend/outputs/<session_id>/batch_results.csv` from
    Stage 9, kept so the user can (re-)download it.

Both are also cleaned up automatically after SESSION_TTL_SECONDS of
inactivity (see session_store.py), but this router lets the user (or the
frontend, on a "Clear results" action) trigger the same cleanup
immediately, and lets the UI show basic session status without needing
its own bookkeeping.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header

from ..session_store import SESSIONS, SESSION_TTL_SECONDS, session_id_from_header

router = APIRouter(prefix="/api/session", tags=["Session"])


@router.get("")
async def session_status(x_session_id: Optional[str] = Header(None)):
    """Report whether this session currently holds any pipeline data.

    Lets the frontend show something like "You have unsaved results from
    12 minutes ago" or gray out a "Clear results" button when there's
    nothing to clear, without keeping its own shadow copy of that state.
    """
    session_key = session_id_from_header(x_session_id)
    session = SESSIONS.get(session_key)  # also refreshes last_accessed
    age = SESSIONS.session_age_seconds(session_key)

    return {
        "session": session_key,
        "hasData": session.has_any_data(),
        "ageSeconds": round(age, 1) if age is not None else None,
        "idleTimeoutSeconds": SESSION_TTL_SECONDS,
    }


@router.delete("")
async def clear_session(x_session_id: Optional[str] = Header(None)):
    """Clear this session's in-memory pipeline results and exported CSV output.

    Safe to call at any point (e.g. a "Clear results" button after the user
    has downloaded what they need) -- it only ever removes this session's
    own data, and re-running any stage endpoint afterwards starts a fresh
    SessionState exactly as if the session were brand new.
    """
    session_key = session_id_from_header(x_session_id)
    SESSIONS.reset(session_key)

    return {
        "session": session_key,
        "cleared": True,
    }
