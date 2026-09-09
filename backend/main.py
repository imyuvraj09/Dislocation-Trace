"""
backend/main.py
================
FastAPI entrypoint for the TEM Dislocation Analysis Pipeline API.

This file, and everything under backend/app/, is a thin REST wrapper
around the untouched scientific pipeline in backend/fileskh/. No
function names, dataclass structures, or stage outputs from that
package are modified -- this module only calls them and serializes
their results to JSON.

Run from the project root:

    uvicorn backend.main:app --reload

Interactive API docs will be available at http://localhost:8000/docs
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    materials,
    session_admin,
    stage1_detection,
    stage2_miller,
    stage3_pairs,
    stage4_angles,
    stage6_solve,
    stage7_trueline,
    stage8_classify,
    stage9_batch,
)

app = FastAPI(
    title="TEM Dislocation Analysis Pipeline API",
    description=(
        "REST wrapper around the 9-stage TEM dislocation dataclass pipeline "
        "(line_detector, angle_calculator, equation_solver, true_line_solver, "
        "classifier, batch_reporter)."
    ),
    version="1.0.0",
)

# CORS so the Next.js frontend (default dev server on :3000) can call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your frontend origin(s) in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session_admin.router)
app.include_router(materials.router)
app.include_router(stage1_detection.router)
app.include_router(stage2_miller.router)
app.include_router(stage3_pairs.router)
app.include_router(stage4_angles.router)
app.include_router(stage6_solve.router)
app.include_router(stage7_trueline.router)
app.include_router(stage8_classify.router)
app.include_router(stage9_batch.router)


@app.get("/")
async def root():
    return {
        "name": "TEM Dislocation Analysis Pipeline API",
        "docs": "/docs",
        "stages": [
            "/api/materials",
            "/api/stage1/detect-lines",
            "/api/stage1/detect-gvecs",
            "/api/stage2/miller",
            "/api/stage3/pairs",
            "/api/stage4/angles",
            "/api/stage6/solve-up",
            "/api/stage7/true-line",
            "/api/stage8/classify",
            "/api/stage9/batch",
            "DELETE /api/session (clear this session's cached results)",
        ],
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
