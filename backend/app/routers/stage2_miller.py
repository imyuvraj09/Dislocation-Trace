"""
Stage 2 -- Miller-index assignment.

Sets GVector.hkl for previously-detected g-vectors. No pipeline module
does this by itself in CLI mode (it's user-prompt driven in
pipeline.py's `_assign_miller`); here it is simply an in-place field
update on the dataclasses already produced by Stage 1.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from fileskh.pipeline_types import GVector

from ..serializers import serialize
from ..session_store import SESSIONS, session_id_from_header
from ..crystal_context import bind_crystal_context

router = APIRouter(prefix="/api/stage2", tags=["Stage 2 - Miller indices"])


class MillerAssignment(BaseModel):
    source: str = Field(..., description="Diffraction image basename, e.g. df1.png")
    g_id: str = Field(..., description="g-vector id, e.g. g01")
    hkl: List[int]


class MillerRequest(BaseModel):
    material_id: str
    c_over_a: Optional[float] = None
    assignments: List[MillerAssignment]


@router.post("/miller")
async def submit_miller_indices(payload: MillerRequest, x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    geometry = bind_crystal_context(session, payload.material_id, payload.c_over_a)
    updated = []
    for a in payload.assignments:
        try:
            geometry.plane_to_cartesian(a.hkl)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        gvecs = session.gvecs_by_img.get(a.source)
        if gvecs is None:
            gvecs = []
            session.gvecs_by_img[a.source] = gvecs
        match = next((g for g in gvecs if g.g_id == a.g_id), None)
        if match is None:
            match = GVector(
                g_id=a.g_id,
                source=a.source,
                ox=0, oy=0, tx=100, ty=100,
                vx=100, vy=100,
                length_px=141.42,
                hkl=tuple(a.hkl),
            )
            gvecs.append(match)
        else:
            match.hkl = tuple(a.hkl)
        updated.append(match)

    return {"accepted": True, "updated": serialize(updated)}
