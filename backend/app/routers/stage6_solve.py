"""
Stage 6 -- Up-vector solving.

Wraps fileskh.equation_solver.solve_Up.
"""

from __future__ import annotations

from typing import List, Optional

import numpy as np
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from fileskh.equation_solver import solve_Up

from ..serializers import serialize
from ..session_store import SESSIONS, session_id_from_header
from ..crystal_context import bind_crystal_context

router = APIRouter(prefix="/api/stage6", tags=["Stage 6 - Solve Up"])


class SolveUpRequest(BaseModel):
    pair_id: str
    image: str = Field(..., description="TEM image basename (line.image)")
    line_id: str = Field(..., description='Line label, e.g. "L1"')
    diff_image: str = Field(..., description="Diffraction image the g-vectors were detected in")
    g_ids: List[str] = Field(..., min_items=3, max_items=3)
    material_id: str
    c_over_a: Optional[float] = None
    zone_axis: List[float] = Field(..., description="Zone-axis indices: [u v w], or HCP [u v t w]")
    force_zone: bool = False


@router.post("/solve-up")
async def solve_up_vector(payload: SolveUpRequest, x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    geometry = bind_crystal_context(session, payload.material_id, payload.c_over_a)

    gvecs = session.gvecs_by_img.get(payload.diff_image)
    if not gvecs:
        raise HTTPException(status_code=404, detail=f"No g-vectors found for '{payload.diff_image}'.")
    gmap = {g.g_id: g for g in gvecs}
    try:
        selected = [gmap[gid] for gid in payload.g_ids]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"g-vector {exc} not found in '{payload.diff_image}'.") from exc

    B = np.array(payload.zone_axis, dtype=float)

    try:
        sr = solve_Up(
            selected_gvecs=selected,
            angle_rows=session.angle_rows,
            B=B,
            pair_id=payload.pair_id,
            image=payload.image,
            line_id=payload.line_id,
            force_zone=payload.force_zone,
            crystal_system=geometry.crystal_system,
            c_over_a=geometry.c_over_a,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    session.solve_results[(payload.pair_id, payload.image)] = sr
    session.zone_axes[payload.image] = list(payload.zone_axis)

    return {"result": serialize(sr)}


@router.get("/solve-up")
async def get_solve_results(x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    return {"results": serialize(list(session.solve_results.values()))}
