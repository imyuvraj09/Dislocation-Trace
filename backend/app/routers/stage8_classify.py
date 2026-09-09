"""
Stage 8 (frontend Stage 7 -- "Classification") -- experimental g.b
observations, automatic Burgers-vector resolution against the selected
material's crystallographically-allowed family, and character/slip-plane
classification.

Wraps fileskh.classifier.classify (untouched) and the new
crystallography.solver (ported from g.b's BurgersSolver). See STAGE 7
REDESIGN / AUTOMATIC BURGERS-VECTOR DETERMINATION in the integration
spec for the full data-flow this implements:

    experimental g.b observations
        -> material's Burgers-vector family (crystallography.queries)
        -> ported BurgersSolver (crystallography.solver)
        -> exactly one 100%-consistent candidate -> auto-resolved
        -> more than one                          -> user must confirm
        -> none                                    -> 409, stage blocked
        -> resolved vector -> fileskh.classifier.classify (unchanged)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from fileskh.classifier import classify

from crystallography import queries
from crystallography.loader import CrystallographyLoadError
from crystallography.models import GBObservationInput

from ..serializers import serialize
from ..session_store import PairGbState, SESSIONS, session_id_from_header
from ..crystal_context import bind_crystal_context

router = APIRouter(prefix="/api/stage8", tags=["Stage 8 - Classify"])


# ── existing manual-burgers endpoint (untouched; kept for compatibility /  ──
# ── future reuse -- see the integration plan's note on why fileskh's      ──
# ── classify() and this call path are left exactly as they were)          ──

class ClassifyRequest(BaseModel):
    pair_id: str
    burgers: List[float]


@router.post("/classify")
async def classify_line(payload: ClassifyRequest, x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))

    true_line = session.true_lines.get(payload.pair_id)
    if true_line is None:
        raise HTTPException(
            status_code=400,
            detail=f"No TrueLineResult for pair '{payload.pair_id}'. Run Stage 6 first.",
        )

    if not payload.burgers:
        raise HTTPException(status_code=422, detail="Burgers vector cannot be empty.")

    if all(abs(float(x)) < 1e-9 for x in payload.burgers):
        raise HTTPException(status_code=422, detail="Burgers vector cannot be all zeros.")

    crystal_system = true_line.crystal_system or session.crystal_system or "cubic"
    c_over_a = true_line.c_over_a or session.c_over_a
    from crystallography.geometry import CrystalGeometry
    geometry = CrystalGeometry(crystal_system, c_over_a)
    expected_count = 4 if crystal_system == "hcp" else 3
    if len(payload.burgers) != expected_count:
        raise HTTPException(
            status_code=422,
            detail=f"{crystal_system.upper()} requires {expected_count} indices for Burgers vector. Got {len(payload.burgers)}.",
        )

    try:
        geometry.direction_to_cartesian(payload.burgers)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    burgers = np.array(payload.burgers, dtype=float)
    try:
        cr = classify(true_line, burgers)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    session.classify_results[payload.pair_id] = cr
    session.burgers = list(payload.burgers)
    session.burgers_by_pair[payload.pair_id] = list(payload.burgers)

    return {"classification": serialize(cr)}


@router.get("/classify")
async def get_classifications(x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    return {"classifications": serialize(list(session.classify_results.values()))}


# ── g.b observations (the new Stage 7 workflow) ─────────────────────────────

class ObservationIn(BaseModel):
    image_id: str
    g_vector_id: str
    miller_index: List[int]
    gb: Optional[int] = Field(None, description="+1, 0, -1, or null if not yet recorded")
    notes: str = ""


class SubmitObservationsRequest(BaseModel):
    pair_id: str
    material_id: str
    c_over_a: Optional[float] = None
    observations: List[ObservationIn]


def _run_solver_and_maybe_classify(session, material_id: str, state: PairGbState) -> None:
    """Re-derives candidates/resolution from `state.observations` and, if
    the true line for this pair is already available and the Burgers
    vector is uniquely resolved, runs the untouched classifier -- exactly
    mirroring what the old manual-entry flow did, just triggered
    automatically instead of by a typed-in value."""
    complete_obs = [o for o in state.observations if o.gb is not None]
    invisible_g = [o.miller_index for o in complete_obs if o.gb == 0]
    visible_g = [o.miller_index for o in complete_obs if o.gb != 0]

    if not complete_obs or (not invisible_g and not visible_g):
        state.candidates = []
        state.resolved_burgers = None
        state.math_derivation = ""
        return

    result = queries.solve_candidates(material_id, invisible_g, visible_g)
    consistent = queries.fully_consistent_candidates(result)

    state.candidates = consistent
    state.math_derivation = result.math_derivation

    if len(state.observations) == 0 or any(o.gb is None for o in state.observations):
        # Not every generated row has an observation yet -- don't resolve
        # or auto-classify on a partial set (STAGE 7 REDESIGN: "Stage
        # completes only when every observation has g.b").
        state.resolved_burgers = None
        return

    if session.burgers is not None:
        state.resolved_burgers = list(session.burgers)
        true_line = session.true_lines.get(state.pair_id)
        if true_line is not None:
            burgers_arr = np.array(session.burgers, dtype=float)
            cr = classify(true_line, burgers_arr)
            session.classify_results[state.pair_id] = cr
        return

    if len(consistent) == 1:
        state.resolved_burgers = list(consistent[0].b_vector)
    else:
        # Zero or multiple candidates -- never guess; wait for either more
        # data or an explicit user confirmation (select-burgers-candidate).
        state.resolved_burgers = None

    if state.resolved_burgers is not None:
        true_line = session.true_lines.get(state.pair_id)
        if true_line is not None:
            burgers_arr = np.array(state.resolved_burgers, dtype=float)
            cr = classify(true_line, burgers_arr)
            session.classify_results[state.pair_id] = cr
            session.burgers = state.resolved_burgers


@router.post("/gb-observations")
async def submit_gb_observations(payload: SubmitObservationsRequest, x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    bind_crystal_context(session, payload.material_id, payload.c_over_a)

    pair = session.pairs.get(payload.pair_id)
    if pair is None:
        raise HTTPException(status_code=404, detail=f"Pair '{payload.pair_id}' not found. Run Stage 3 first.")

    for obs in payload.observations:
        ok, msg = queries.validate_gb_observation(payload.material_id, obs.miller_index, obs.gb)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)

    session.material_id = payload.material_id

    now = datetime.now(timezone.utc).isoformat()
    state = session.gb_observations.get(payload.pair_id) or PairGbState(pair_id=payload.pair_id)
    state.observations = [
        GBObservationInput(
            image_id=o.image_id,
            g_vector_id=o.g_vector_id,
            miller_index=tuple(o.miller_index),
            gb=o.gb,
            notes=o.notes,
            timestamp=now,
        )
        for o in payload.observations
    ]
    session.gb_observations[payload.pair_id] = state

    try:
        _run_solver_and_maybe_classify(session, payload.material_id, state)
    except CrystallographyLoadError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return _serialize_pair_state(session, state)


@router.get("/gb-observations")
async def get_gb_observations(x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    return {"pairs": [_serialize_pair_state(session, s) for s in session.gb_observations.values()]}


class SelectCandidateRequest(BaseModel):
    pair_id: str
    burgers: List[float]


@router.post("/select-burgers-candidate")
async def select_burgers_candidate(payload: SelectCandidateRequest, x_session_id: Optional[str] = Header(None)):
    """Explicit user confirmation when the solver leaves more than one
    crystallographically-consistent candidate (see AUTOMATIC
    BURGERS-VECTOR DETERMINATION: "If multiple candidates exist, Display
    all valid candidates. Allow the user to select the correct one.").
    Only a candidate the solver itself returned may be selected -- this
    endpoint does not accept an arbitrary vector.
    """
    session = SESSIONS.get(session_id_from_header(x_session_id))
    state = session.gb_observations.get(payload.pair_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"No g.b observations recorded yet for pair '{payload.pair_id}'.")

    chosen = tuple(float(x) for x in payload.burgers)
    if not any(
        len(chosen) == len(c.b_vector)
        and all(abs(a - b) < 1e-6 for a, b in zip(chosen, c.b_vector))
        for c in state.candidates
    ):
        raise HTTPException(
            status_code=400,
            detail="Selected vector is not one of the solver's crystallographically-consistent candidates.",
        )

    state.resolved_burgers = list(chosen)

    true_line = session.true_lines.get(payload.pair_id)
    if true_line is not None:
        cr = classify(true_line, np.array(chosen, dtype=float))
        session.classify_results[payload.pair_id] = cr
        session.burgers = state.resolved_burgers

    return _serialize_pair_state(session, state)


def _serialize_pair_state(session, state: PairGbState) -> dict:
    return {
        "pairId": state.pair_id,
        "observations": serialize(state.observations),
        "candidateBurgersVectors": serialize(state.candidates),
        "resolvedBurgersVector": state.resolved_burgers,
        "mathDerivation": state.math_derivation,
        "classification": serialize(session.classify_results.get(state.pair_id)),
    }
