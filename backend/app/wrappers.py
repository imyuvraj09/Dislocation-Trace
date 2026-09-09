"""
app/wrappers.py
================
Small helpers that convert the raw dicts returned by
fileskh.line_detector.detect_all_lines() / detect_g_vectors() into the
typed dataclasses the rest of the pipeline expects
(DetectedLine / GVector).

These mirror the `_wrap_lines` / `_wrap_gvecs` helpers already used
inside fileskh/pipeline.py -- reimplemented here so the API layer does
not need to import pipeline.py's CLI machinery (argparse, prompts,
etc). The scientific modules themselves are untouched.
"""

from __future__ import annotations

from typing import List

from fileskh.pipeline_types import DetectedLine, GVector


def wrap_lines(raw: List[dict], basename: str) -> List[DetectedLine]:
    """Convert raw detect_all_lines() dicts to DetectedLine dataclasses."""
    return [
        DetectedLine(
            label=f"L{i + 1}",
            image=basename,
            color=r.get("color", "unknown"),
            x1=int(r["x1"]), y1=int(r["y1"]),
            x2=int(r["x2"]), y2=int(r["y2"]),
            vx=int(r["vx"]), vy=int(r["vy"]),
            length_px=float(r["length_px"]),
        )
        for i, r in enumerate(raw)
    ]


def wrap_gvecs(raw: List[dict], basename: str) -> List[GVector]:
    """Convert raw detect_g_vectors() dicts to GVector dataclasses."""
    return [
        GVector(
            g_id=r["g_id"],
            source=basename,
            ox=int(r["ox"]), oy=int(r["oy"]),
            tx=int(r["tx"]), ty=int(r["ty"]),
            vx=int(r["vx"]), vy=int(r["vy"]),
            length_px=float(r["length_px"]),
            hkl=None,
        )
        for r in raw
    ]
