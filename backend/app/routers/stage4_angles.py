"""
Stage 4/5 -- G-vector selection + pixel-space angle computation.

Wraps fileskh.angle_calculator.compute_all_pair_angles.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from fileskh.angle_calculator import compute_all_pair_angles
from fileskh.pipeline_types import GVecSelection

from ..serializers import serialize
from ..session_store import SESSIONS, session_id_from_header

router = APIRouter(prefix="/api/stage4", tags=["Stage 4/5 - Angles"])


class SelectionRequest(BaseModel):
    pair_id: str
    image: str = Field(..., description="TEM image basename (identifies the line)")
    diff_image: str = Field(..., description="Corresponding diffraction image basename")
    g_ids: List[str] = Field(..., min_items=3, max_items=3, description="Exactly 3 g-vector ids")


class AnglesRequest(BaseModel):
    selections: List[SelectionRequest]
    tem_to_diff: Dict[str, str] = Field(
        default_factory=dict,
        description="Maps TEM image basename -> diffraction image basename (defaults to identity)",
    )


@router.post("/angles")
async def compute_angles(payload: AnglesRequest, x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))

    if not session.pairs:
        raise HTTPException(status_code=400, detail="No line pairs defined. Run Stage 3 first.")

    selections = [
        GVecSelection(pair_id=s.pair_id, image=s.image, diff_image=s.diff_image, g_ids=list(s.g_ids))
        for s in payload.selections
    ]
    session.selections = selections

    # Refresh line definitions in pairs from session.lines_by_img
    for pair in session.pairs.values():
        if pair.line1 and pair.line1.image in session.lines_by_img:
            l1 = next((l for l in session.lines_by_img[pair.line1.image] if l.label == pair.line1.label), None)
            if l1:
                pair.line1 = l1
        if pair.line2 and pair.line2.image in session.lines_by_img:
            l2 = next((l for l in session.lines_by_img[pair.line2.image] if l.label == pair.line2.label), None)
            if l2:
                pair.line2 = l2

    try:
        rows = compute_all_pair_angles(
            pairs=list(session.pairs.values()),
            lines_by_img=session.lines_by_img,
            gvecs_by_img=session.gvecs_by_img,
            selections=selections,
            tem_to_diff=payload.tem_to_diff,
        )
    except (RuntimeError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    session.angle_rows = rows
    return {"angles": serialize(rows)}


@router.get("/angles")
async def get_angles(x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    return {"angles": serialize(session.angle_rows)}
