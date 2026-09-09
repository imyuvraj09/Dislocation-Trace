"""
Stage 7 -- True 3-D dislocation line reconstruction.

Wraps fileskh.true_line_solver.compute_true_line.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from fileskh.true_line_solver import compute_true_line

from ..serializers import serialize
from ..session_store import SESSIONS, session_id_from_header

router = APIRouter(prefix="/api/stage7", tags=["Stage 7 - True line"])


class TrueLineRequest(BaseModel):
    pair_id: str
    image1: str
    image2: str


@router.post("/true-line")
async def true_line(payload: TrueLineRequest, x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))

    sr1 = session.solve_results.get((payload.pair_id, payload.image1))
    sr2 = session.solve_results.get((payload.pair_id, payload.image2))
    if sr1 is None or sr2 is None:
        raise HTTPException(
            status_code=400,
            detail=f"Missing SolveResult(s) for pair '{payload.pair_id}'. Run Stage 6 for both images first.",
        )

    try:
        tl = compute_true_line(sr1, sr2)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    session.true_lines[payload.pair_id] = tl
    return {"line": serialize(tl)}


@router.get("/true-line")
async def get_true_lines(x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    return {"lines": serialize(list(session.true_lines.values()))}
