"""
Stage 9 -- Structured batch CSV output + summary.

Wraps fileskh.batch_reporter.BatchReporter.
"""

from __future__ import annotations

from typing import List, Optional

import numpy as np
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from fileskh.batch_reporter import BatchReporter
from fileskh.classifier import classify

from ..paths import session_output_dir
from ..serializers import serialize
from ..session_store import SESSIONS, session_id_from_header
from ..crystal_context import geometry_from_session

router = APIRouter(prefix="/api/stage9", tags=["Stage 9 - Batch output"])


class BatchPairRequest(BaseModel):
    pair_id: str
    gvecs_image1: Optional[str] = Field(None, description="Diffraction image basename for image1's g-vectors")
    gvecs_image2: Optional[str] = Field(None, description="Diffraction image basename for image2's g-vectors")
    burgers: Optional[List[float]] = Field(None, description="Pair-specific Burgers vector")


class BatchRequest(BaseModel):
    pairs: List[BatchPairRequest]
    selected_burgers: Optional[List[float]] = Field(None, description="User-selected Burgers vector from g·b Explorer")


@router.post("/batch")
async def write_batch(payload: BatchRequest, x_session_id: Optional[str] = Header(None)):
    session_key = session_id_from_header(x_session_id)
    session = SESSIONS.get(session_key)
    geometry = geometry_from_session(session)

    if payload.selected_burgers is not None:
        try:
            geometry.direction_to_cartesian(payload.selected_burgers)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        session.burgers = [float(x) for x in payload.selected_burgers]

    reporter = BatchReporter(out_dir=str(session_output_dir(session_key)))

    for p in payload.pairs:
        pair = session.pairs.get(p.pair_id)
        if pair is None:
            raise HTTPException(status_code=404, detail=f"Pair '{p.pair_id}' not found. Run Stage 3 first.")

        sr1 = session.solve_results.get((p.pair_id, pair.line1.image))
        sr2 = session.solve_results.get((p.pair_id, pair.line2.image))
        true_line = session.true_lines.get(p.pair_id)

        if not all([sr1, sr2, true_line]):
            raise HTTPException(
                status_code=400,
                detail=f"Pair '{p.pair_id}' is missing Stage 5/6 results. Complete earlier stages first.",
            )

        # Resolve Burgers vector specifically for this pair
        raw_b = (
            p.burgers
            or session.burgers_by_pair.get(p.pair_id)
            or (session.classify_results.get(p.pair_id).burgers.tolist() if p.pair_id in session.classify_results else None)
            or payload.selected_burgers
            or session.burgers
        )
        if not raw_b:
            raise HTTPException(
                status_code=400,
                detail=f"No Burgers vector is available for pair {p.pair_id}. Identify it using g·b or enter the known Burgers vector in the final classification step.",
            )

        if all(abs(float(x)) < 1e-9 for x in raw_b):
            raise HTTPException(
                status_code=422,
                detail=f"Burgers vector for pair {p.pair_id} cannot be all zeros.",
            )

        pair_crystal_system = true_line.crystal_system or geometry.crystal_system or "cubic"
        pair_c_over_a = true_line.c_over_a or geometry.c_over_a
        from crystallography.geometry import CrystalGeometry
        pair_geometry = CrystalGeometry(pair_crystal_system, pair_c_over_a)
        expected_count = pair_geometry.index_count
        if len(raw_b) != expected_count:
            raise HTTPException(
                status_code=422,
                detail=f"{pair_crystal_system.upper()} requires {expected_count} indices for Burgers vector. Got {len(raw_b)}.",
            )

        try:
            pair_geometry.direction_to_cartesian(raw_b)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        pair_burgers_vec = np.array(raw_b, dtype=float)
        clf = classify(true_line, pair_burgers_vec)
        session.classify_results[p.pair_id] = clf
        session.burgers_by_pair[p.pair_id] = [float(x) for x in raw_b]

        B1 = np.array(session.zone_axes.get(pair.line1.image, sr1.B), dtype=float)
        B2 = np.array(session.zone_axes.get(pair.line2.image, sr2.B), dtype=float)
        gvecs1 = session.gvecs_by_img.get(p.gvecs_image1) if p.gvecs_image1 else None
        gvecs2 = session.gvecs_by_img.get(p.gvecs_image2) if p.gvecs_image2 else None

        reporter.add(pair, session.angle_rows, sr1, sr2, true_line, clf, B1, B2, pair_burgers_vec, gvecs1, gvecs2)

    csv_path = reporter.write()
    if not csv_path:
        raise HTTPException(status_code=500, detail="No records to write.")

    return {
        "rows": serialize(reporter._records),
        "csvPath": csv_path,
        "downloadUrl": f"/api/stage9/batch/download?session_id={session_key}",
    }


@router.get("/batch/download")
async def download_batch(session_id: str = "default"):
    session_key = session_id_from_header(session_id)
    csv_path = session_output_dir(session_key) / "batch_results.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="No batch_results.csv yet. Call POST /api/stage9/batch first.")
    return FileResponse(str(csv_path), media_type="text/csv", filename="dislocation_batch_output.csv")
