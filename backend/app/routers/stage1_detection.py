"""
Stage 1 -- Image detection.

Wraps fileskh.line_detector.load_image / detect_all_lines / detect_g_vectors.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Header, HTTPException, UploadFile, Form

from fileskh.line_detector import detect_all_lines, detect_g_vectors, load_image

from ..paths import UPLOAD_DIR
from ..serializers import serialize
from ..session_store import SESSIONS, session_id_from_header
from ..wrappers import wrap_gvecs, wrap_lines

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stage1", tags=["Stage 1 - Detection"])

# Accepted upload types and a size ceiling so a stray large/non-image upload
# can't exhaust disk space or feed garbage into OpenCV.
_ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}
_MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB


def _save_upload(file: UploadFile) -> Path:
    """Validate and persist an uploaded image, returning its path on disk.

    Raises HTTPException(400) for an unsupported extension and
    HTTPException(413) for an upload that exceeds _MAX_UPLOAD_BYTES,
    before anything touches OpenCV.
    """
    suffix = Path(file.filename or "image.png").suffix.lower() or ".png"
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {sorted(_ALLOWED_SUFFIXES)}",
        )

    dest = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    written = 0
    chunk_size = 1024 * 1024
    try:
        with dest.open("wb") as f:
            while chunk := file.file.read(chunk_size):
                written += len(chunk)
                if written > _MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.",
                    )
                f.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except OSError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Could not save upload: {exc}") from exc

    return dest


@router.post("/detect-lines")
async def detect_lines(
    file: UploadFile = File(..., description="TEM image with colored dotted dislocation lines"),
    min_px: int = Form(20, description="Minimum DBSCAN cluster size"),
    x_session_id: Optional[str] = Header(None),
):
    """Detect dislocation lines in a TEM image. Returns DetectedLine[] for this image."""
    session = SESSIONS.get(session_id_from_header(x_session_id))
    saved_path = _save_upload(file)
    try:
        bgr = load_image(str(saved_path))
        raw_lines = detect_all_lines(bgr, min_cluster_px=min_px)
    except Exception as exc:
        logger.exception("Line detection failed for upload %s", saved_path.name)
        saved_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Line detection failed: {exc}") from exc

    basename = file.filename or saved_path.name
    lines = wrap_lines(raw_lines, basename)
    session.lines_by_img[basename] = lines
    h, w = bgr.shape[:2]

    # The raw image is only needed for this detection pass -- no later stage
    # re-reads it from disk (pairing/angles/solve/classify all key off the
    # DetectedLine/GVector data already extracted above). Nothing is stored
    # locally or server-side beyond the moment of processing.
    saved_path.unlink(missing_ok=True)

    return {
        "image": basename,
        "width": w,
        "height": h,
        "detectedLines": len(lines),
        "lines": serialize(lines),
    }


@router.post("/detect-gvecs")
async def detect_gvecs(
    file: UploadFile = File(..., description="Diffraction image with orange g-vector arrows"),
    x_session_id: Optional[str] = Header(None),
):
    """Detect g-vector arrows in a diffraction-pattern image. Returns GVector[] for this image."""
    session = SESSIONS.get(session_id_from_header(x_session_id))
    saved_path = _save_upload(file)
    try:
        bgr = load_image(str(saved_path))
        raw_gvecs = detect_g_vectors(bgr)
    except Exception as exc:
        if "No orange" in str(exc):
            raw_gvecs = []
        else:
            logger.exception("G-vector detection failed for upload %s", saved_path.name)
            saved_path.unlink(missing_ok=True)
            raise HTTPException(status_code=422, detail=f"G-vector detection failed: {exc}") from exc

    basename = file.filename or saved_path.name
    gvecs = wrap_gvecs(raw_gvecs, basename)
    session.gvecs_by_img[basename] = gvecs
    h, w = bgr.shape[:2]

    # See detect_lines: nothing downstream re-reads the raw file, so it's
    # removed immediately -- uploads are processed in passing, not retained.
    saved_path.unlink(missing_ok=True)

    return {
        "image": basename,
        "width": w,
        "height": h,
        "candidates": serialize(gvecs),
    }


from pydantic import BaseModel, Field
from typing import List
from fileskh.pipeline_types import DetectedLine, GVector


class SyncedLine(BaseModel):
    label: str
    color: str = "manual"
    x1: int
    y1: int
    x2: int
    y2: int
    vx: Optional[int] = None
    vy: Optional[int] = None
    length_px: Optional[float] = None


class SyncedTemImage(BaseModel):
    image: str
    lines: List[SyncedLine] = Field(default_factory=list)


class SyncedGVector(BaseModel):
    g_id: str
    ox: int
    oy: int
    tx: int
    ty: int
    vx: Optional[int] = None
    vy: Optional[int] = None
    length_px: Optional[float] = None
    hkl: Optional[List[int]] = None


class SyncedDiffImage(BaseModel):
    image: str
    gvecs: List[SyncedGVector] = Field(default_factory=list)


class SyncAnnotationsRequest(BaseModel):
    temImages: List[SyncedTemImage] = Field(default_factory=list)
    diffImages: List[SyncedDiffImage] = Field(default_factory=list)


@router.post("/sync-annotations")
async def sync_annotations(payload: SyncAnnotationsRequest, x_session_id: Optional[str] = Header(None)):
    """Synchronize manually-drawn lines and g-vectors from frontend store to backend session."""
    session = SESSIONS.get(session_id_from_header(x_session_id))

    for tem in payload.temImages:
        converted_lines = []
        for l in tem.lines:
            vx = l.vx if l.vx is not None else (l.x2 - l.x1)
            vy = l.vy if l.vy is not None else (l.y2 - l.y1)
            length = l.length_px if l.length_px is not None else float((vx**2 + vy**2)**0.5)
            converted_lines.append(
                DetectedLine(
                    label=l.label,
                    image=tem.image,
                    color=l.color,
                    x1=l.x1, y1=l.y1,
                    x2=l.x2, y2=l.y2,
                    vx=int(vx), vy=int(vy),
                    length_px=float(length),
                )
            )
        session.lines_by_img[tem.image] = converted_lines

    for diff in payload.diffImages:
        converted_gvecs = []
        for g in diff.gvecs:
            vx = g.vx if g.vx is not None else (g.tx - g.ox)
            vy = g.vy if g.vy is not None else (g.ty - g.oy)
            length = g.length_px if g.length_px is not None else float((vx**2 + vy**2)**0.5)
            converted_gvecs.append(
                GVector(
                    g_id=g.g_id,
                    source=diff.image,
                    ox=g.ox, oy=g.oy,
                    tx=g.tx, ty=g.ty,
                    vx=int(vx), vy=int(vy),
                    length_px=float(length),
                    hkl=tuple(g.hkl) if g.hkl is not None else None,
                )
            )
        session.gvecs_by_img[diff.image] = converted_gvecs

    return {
        "status": "ok",
        "syncedTemImages": len(payload.temImages),
        "syncedDiffImages": len(payload.diffImages),
    }
