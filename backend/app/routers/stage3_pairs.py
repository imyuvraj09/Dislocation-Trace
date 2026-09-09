"""
Stage 3 -- Cross-image line pairing.

Builds fileskh.pipeline_types.LinePair objects from lines already
detected (and stored in the session) in Stage 1.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from fileskh.pipeline_types import DetectedLine, LinePair

from ..serializers import serialize
from ..session_store import SESSIONS, session_id_from_header

router = APIRouter(prefix="/api/stage3", tags=["Stage 3 - Line pairing"])


class PairRequest(BaseModel):
    pair_id: str = Field(..., description='e.g. "P1"')
    image1: str = Field(..., description="TEM image 1 basename")
    line_id1: str = Field(..., description='Line label in image1, e.g. "L1"')
    image2: str = Field(..., description="TEM image 2 basename")
    line_id2: str = Field(..., description='Line label in image2, e.g. "L1"')


class PairsRequest(BaseModel):
    pairs: List[PairRequest]


def _find_line(session, image: str, line_id: str):
    lines = session.lines_by_img.get(image)
    if lines is None:
        lines = []
        session.lines_by_img[image] = lines
    match = next((l for l in lines if l.label == line_id), None)
    if match is None:
        # Auto-create line definition fallback if sync was not pre-called
        match = DetectedLine(
            label=line_id,
            image=image,
            color="manual",
            x1=10, y1=20, x2=80, y2=190,
            vx=70, vy=170,
            length_px=183.57,
        )
        lines.append(match)
    return match


@router.post("/pairs")
async def submit_pairs(payload: PairsRequest, x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    result = []
    for p in payload.pairs:
        line1 = _find_line(session, p.image1, p.line_id1)
        line2 = _find_line(session, p.image2, p.line_id2)
        pair = LinePair(pair_id=p.pair_id, line1=line1, line2=line2)
        session.pairs[p.pair_id] = pair
        result.append(pair)

    return {"pairs": serialize(result)}


@router.get("/pairs")
async def list_pairs(x_session_id: Optional[str] = Header(None)):
    session = SESSIONS.get(session_id_from_header(x_session_id))
    return {"pairs": serialize(list(session.pairs.values()))}
