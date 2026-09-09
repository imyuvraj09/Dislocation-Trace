"""
app/paths.py
=============
Single source of truth for the backend's on-disk runtime directories.

Previously `UPLOAD_DIR` and `OUT_DIR` were each computed independently
with the same `Path(__file__).resolve().parent.parent.parent / "..."`
expression in stage1_detection.py and stage9_batch.py -- harmless while
there were only two copies, but a trap waiting to bite the moment one of
them moved or a third router needed the same path. Centralized here so
there is exactly one place that knows where these directories live.
"""

from __future__ import annotations

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

UPLOAD_DIR = BACKEND_DIR / "uploads"
OUTPUT_DIR = BACKEND_DIR / "outputs"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)


def session_output_dir(session_id: str) -> Path:
    """Per-session subdirectory under OUTPUT_DIR (e.g. Stage 9's batch CSV).

    Callers must pass an already-validated session_id (see
    session_store.session_id_from_header) -- this function does not
    re-validate, to keep validation in exactly one place.
    """
    return OUTPUT_DIR / session_id
