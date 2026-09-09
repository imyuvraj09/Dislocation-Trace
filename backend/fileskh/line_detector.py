"""
modules/line_detector.py
=========================
Stage 1 — Image detection.

Detects all COLOURED DOTTED dislocation lines in TEM images and
orange g-vector arrows in diffraction images.

Colour pipeline (for each dislocation colour)
----------------------------------------------
  1. HSV colour mask.  Each colour has calibrated H/S/V thresholds.
     Red is split into two bands because it wraps around 0°/360°.
     White uses local-contrast masking (gray − GaussBlur31 > 40, S < 35).
  2. Exclusion zones (top-left diffraction inset, top text strip, scale bar).
  3. DBSCAN eps = 25 px — bridges typical inter-dot gaps of 5-15 px.
  4. Clusters smaller than min_cluster_px are discarded.
  5. polyfit through cluster pixels → (endpoint1, endpoint2, vector).

Supported line colours:  red · white · orange · yellow · green ·
                          cyan · blue · magenta

G-vector detection (for diffraction images)
--------------------------------------------
  HSV orange mask → HoughLinesP → origin by endpoint/intersection
  clustering → per-angle tip clustering → ID labelling g01, g02, …

Public API
----------
  load_image(path)                       → np.ndarray  (BGR)
  detect_all_lines(bgr, min_cluster_px)  → List[dict]  (all colours)
  detect_g_vectors(bgr)                  → List[dict]  (orange arrows)
"""

from __future__ import annotations

import logging
import math
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
from matplotlib import lines
import numpy as np
from sklearn.cluster import DBSCAN

logger = logging.getLogger(__name__)


def _resolve_output_path(image_path: str, output_dir: Optional[str], subdir: str, suffix: str) -> Path:
    """Build an output path inside output_dir/<subdir> that mirrors the input image layout."""
    base_dir = Path(output_dir) if output_dir else Path(__file__).resolve().parent / "outputs"
    out_dir = base_dir / subdir
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(image_path).stem
    return out_dir / f"{stem}{suffix}.png"

# ─────────────────────────────────────────────────────────────────────────────
# HSV colour ranges  (H: 0-180, S: 0-255, V: 0-255 — OpenCV convention)
# ─────────────────────────────────────────────────────────────────────────────
# Each entry is a list of (lower, upper) pairs.
# Red uses two bands because hue wraps around 0°.
_COLOUR_HSV: Dict[str, List[Tuple[np.ndarray, np.ndarray]]] = {
    "red": [
        (np.array([0,   150, 70]), np.array([8,   255, 255])),
        (np.array([172, 150, 70]), np.array([180, 255, 255])),
    ],
    "orange": [
        (np.array([9,  100, 80]), np.array([22, 255, 255])),
    ],
    "yellow": [
        (np.array([22, 100, 80]), np.array([35, 255, 255])),
    ],
    "green": [
        (np.array([35, 90, 70]), np.array([88, 255, 255])),
    ],
    "cyan": [
        (np.array([82, 75, 70]), np.array([102, 255, 255])),
    ],
    "blue": [
        (np.array([100, 75, 70]), np.array([130, 255, 255])),
    ],
    "magenta": [
        (np.array([140, 75, 70]), np.array([172, 255, 255])),
    ],
    # "white" is detected separately via local-contrast masking
}

# ─────────────────────────────────────────────────────────────────────────────
# Detection parameters
# ─────────────────────────────────────────────────────────────────────────────
_DOT_EPS     = 25     # DBSCAN radius — bridges ~5-15 px inter-dot gaps
_DOT_MINPTS  = 2      # DBSCAN min_samples
_DEF_MIN_PX  = 20     # minimum cluster size to count as a line segment

# White-line specific thresholds
_WHITE_V_THRESH  = 180   # minimum absolute brightness
_WHITE_LC_THRESH = 40    # minimum local contrast (gray − GaussBlur31)
_WHITE_S_THRESH  = 35    # maximum HSV saturation (rejects coloured pixels)

# G-vector arrow detection (orange, in diffraction images)
_GVEC_ORG_LO    = np.array([9,  100, 80])
_GVEC_ORG_HI    = np.array([22, 255, 255])
_GVEC_MIN_FRAC  = 0.28   # ignore tips closer than this fraction of max dist
_GVEC_MERGE_DEG = 12.0   # merge arrows within this angular range

# Colour palette for matplotlib overlays (RGB hex)
PALETTE = [
    "#e41a1c", "#4daf4a", "#377eb8", "#ff7f00",
    "#984ea3", "#a65628", "#f781bf", "#ffff33",
    "#00ffff", "#ff69b4", "#7fff00", "#dc143c",
]


# ─────────────────────────────────────────────────────────────────────────────
# Public  —  image loader
# ─────────────────────────────────────────────────────────────────────────────

def load_image(path: str) -> np.ndarray:
    """
    Load an image as a BGR numpy array.

    Raises FileNotFoundError if the path does not exist or cannot be decoded.
    """
    bgr = cv2.imread(str(path))
    if bgr is None:
        raise FileNotFoundError(
            f"Cannot load image: {path!r}.  "
            "Check the path and that the file is a supported image format."
        )
    return bgr


# ─────────────────────────────────────────────────────────────────────────────
# Exclusion-zone helper
# ─────────────────────────────────────────────────────────────────────────────

def _apply_exclusions(mask: np.ndarray, h: int, w: int) -> np.ndarray:
    """
    Zero out known non-line regions:
      • Top-left diffraction pattern inset  (≤27 % h × ≤35 % w)
      • Top text / zone-axis label strip    (≤42 px)
      • Bottom-left scale bar              (≥88 % h × ≤22 % w)
    """
    mask[:int(h * 0.27), :int(w * 0.35)] = 0   # diff inset
    mask[:42, :]                           = 0   # label strip
    mask[int(h * 0.88):, :int(w * 0.22)] = 0   # scale bar
    return mask


# ─────────────────────────────────────────────────────────────────────────────
# polyfit → line endpoints
# ─────────────────────────────────────────────────────────────────────────────

def _polyfit_endpoints(
    pixels: np.ndarray,
) -> Tuple[Tuple[int, int], Tuple[int, int], float, float]:
    """
    Fit a straight line through (row, col) cluster pixels.

    Returns (p1, p2, vx, vy) where p1/p2 are (x, y) image endpoints.
    Uses the dominant axis (x or y) for the fit to avoid singularities.
    """
    ys, xs  = pixels[:, 0], pixels[:, 1]
    y_range = int(ys.max() - ys.min())
    x_range = int(xs.max() - xs.min())

    if y_range >= x_range:                     # predominantly vertical
        coef = np.polyfit(ys, xs, 1)
        p1 = (int(round(float(np.polyval(coef, float(ys.min()))))), int(ys.min()))
        p2 = (int(round(float(np.polyval(coef, float(ys.max()))))), int(ys.max()))
    else:                                       # predominantly horizontal
        coef = np.polyfit(xs, ys, 1)
        p1 = (int(xs.min()), int(round(float(np.polyval(coef, float(xs.min()))))))
        p2 = (int(xs.max()), int(round(float(np.polyval(coef, float(xs.max()))))))

    vx, vy = float(p2[0] - p1[0]), float(p2[1] - p1[1])
    return p1, p2, vx, vy


# ─────────────────────────────────────────────────────────────────────────────
# Single-colour detector
# ─────────────────────────────────────────────────────────────────────────────

def _detect_one_colour(
    hsv:       np.ndarray,
    ranges:    List[Tuple[np.ndarray, np.ndarray]],
    h:         int,
    w:         int,
    min_px:    int,
    color:     str,
) -> List[dict]:
    """
    Detect line segments of one specific colour.

    Returns a list of raw line dicts (one per significant DBSCAN cluster).
    """
    # Build colour mask (union of all ranges for this colour)
    mask = np.zeros((h, w), dtype=np.uint8)
    for lo, hi in ranges:
        mask |= cv2.inRange(hsv, lo, hi)

    # Morphological closing to fill tiny intra-dot gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask   = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    mask   = _apply_exclusions(mask, h, w)

    pixels = np.argwhere(mask > 0)
    if len(pixels) < max(min_px, 4):
        return []

    db   = DBSCAN(eps=_DOT_EPS, min_samples=_DOT_MINPTS).fit(pixels)
    lbls = db.labels_

    results = []
    for lbl in set(lbls):
        if lbl == -1:
            continue
        cluster = pixels[lbls == lbl]
        if len(cluster) < min_px:
            continue

        p1, p2, vx, vy = _polyfit_endpoints(cluster)
        length = math.hypot(vx, vy)
        results.append({
            "color":     color,
            "x1": p1[0], "y1": p1[1],
            "x2": p2[0], "y2": p2[1],
            "vx": round(vx, 2),
            "vy": round(vy, 2),
            "length_px": round(length, 2),
            "n_pixels":  int(len(cluster)),
        })
        logger.debug(f"  {color}: ({p1[0]},{p1[1]})→({p2[0]},{p2[1]})"
                     f"  v=({vx:.1f},{vy:.1f})  {len(cluster)}px")

    return results


# ─────────────────────────────────────────────────────────────────────────────
# White-line detector  (local-contrast method)
# ─────────────────────────────────────────────────────────────────────────────

def _detect_white_lines(
    bgr:    np.ndarray,
    hsv:    np.ndarray,
    h:      int,
    w:      int,
    min_px: int,
) -> List[dict]:
    """
    Detect white dotted lines using a local-contrast + saturation mask.

    Works on the greyscale channel:
        local_contrast = gray − GaussianBlur(gray, 31×31)
    Keeps pixels that are:
        (a) V > WHITE_V_THRESH   — bright enough  (not grey background)
        (b) local_contrast > LC_THRESH  — locally brighter than surroundings
        (c) S < WHITE_S_THRESH   — achromatic  (not any of the colour lines)
    """
    gray    = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (31, 31), 0)
    lc      = gray.astype(np.float32) - blurred.astype(np.float32)
    sat     = hsv[:, :, 1]

    mask = (
        (gray.astype(np.int32) > _WHITE_V_THRESH) &
        (lc  > _WHITE_LC_THRESH) &
        (sat < _WHITE_S_THRESH)
    ).astype(np.uint8) * 255
    mask = _apply_exclusions(mask, h, w)

    pixels = np.argwhere(mask > 0)
    if len(pixels) < max(min_px, 4):
        return []

    db   = DBSCAN(eps=_DOT_EPS, min_samples=_DOT_MINPTS).fit(pixels)
    lbls = db.labels_

    results = []
    for lbl in set(lbls):
        if lbl == -1:
            continue
        cluster = pixels[lbls == lbl]
        if len(cluster) < min_px:
            continue

        p1, p2, vx, vy = _polyfit_endpoints(cluster)
        length = math.hypot(vx, vy)
        results.append({
            "color":     "white",
            "x1": p1[0], "y1": p1[1],
            "x2": p2[0], "y2": p2[1],
            "vx": round(vx, 2),
            "vy": round(vy, 2),
            "length_px": round(length, 2),
            "n_pixels":  int(len(cluster)),
        })
        logger.debug(f"  white: ({p1[0]},{p1[1]})→({p2[0]},{p2[1]})"
                     f"  v=({vx:.1f},{vy:.1f})  {len(cluster)}px")

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Public  —  detect all coloured dislocation lines
# ─────────────────────────────────────────────────────────────────────────────

def detect_all_lines(
    bgr:            np.ndarray,
    min_cluster_px: int = _DEF_MIN_PX,
    max_lines:      int = 20,
) -> List[dict]:
    """
    Detect ALL coloured dotted dislocation lines in a TEM image.

    Detects red, orange, yellow, green, cyan, blue, magenta, and white.
    Results are sorted by pixel-cluster size (largest first) then trimmed
    to at most max_lines.

    Parameters
    ----------
    bgr            : BGR image array from load_image().
    min_cluster_px : minimum DBSCAN cluster size (default 20).
                     Lower this with --min-px if thin lines are missed.
    max_lines      : maximum number of lines returned (default 20).

    Returns
    -------
    List of dicts with keys:
        color, x1, y1, x2, y2, vx, vy, length_px, n_pixels
    """
    h, w = bgr.shape[:2]
    hsv  = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

    all_lines: List[dict] = []

    # Coloured lines
    for color, ranges in _COLOUR_HSV.items():
        segs = _detect_one_colour(hsv, ranges, h, w, min_cluster_px, color)
        all_lines.extend(segs)
        if segs:
            logger.info(f"  [{color}]: {len(segs)} segment(s)")

    # White lines
    white_segs = _detect_white_lines(bgr, hsv, h, w, min_cluster_px)
    all_lines.extend(white_segs)
    if white_segs:
        logger.info(f"  [white]: {len(white_segs)} segment(s)")

    # Sort by cluster size descending, truncate
    all_lines.sort(key=lambda d: d["n_pixels"], reverse=True)
    all_lines = all_lines[:max_lines]

    logger.info(f"  Total lines detected: {len(all_lines)}")
    return all_lines


# ─────────────────────────────────────────────────────────────────────────────
# G-vector arrow helpers  (diffraction images, orange arrows)
# ─────────────────────────────────────────────────────────────────────────────

def find_origin_by_endpoints(lines: np.ndarray, eps: float = 20) -> Tuple[int, int]:
    """
    Estimate common origin from Hough line endpoints.

    Supports both OpenCV formats:
        (N,1,4)
        (N,4)
    """

    lines = np.asarray(lines)

    if lines.ndim == 3:
        lines = lines[:, 0]

    elif lines.ndim != 2 or lines.shape[1] != 4:
        raise RuntimeError(f"Unexpected line array shape: {lines.shape}")

    pts = lines.reshape(-1, 2).astype(float)

    db = DBSCAN(eps=eps, min_samples=2).fit(pts)

    best_lbl = -1
    best_n = 0

    for lbl in set(db.labels_):
        if lbl == -1:
            continue

        n = np.sum(db.labels_ == lbl)

        if n > best_n:
            best_n = n
            best_lbl = lbl

    if best_lbl == -1:
        return int(pts[:, 0].mean()), int(pts[:, 1].mean())

    cluster = pts[db.labels_ == best_lbl]

    return (
        int(cluster[:, 0].mean()),
        int(cluster[:, 1].mean()),
    )

def find_origin_by_intersections(lines: np.ndarray) -> Tuple[float, float]:
    """
    Estimate diffraction origin using least-squares intersection.

    Supports both OpenCV formats:
        (N,1,4)
        (N,4)
    """

    lines = np.asarray(lines)

    if lines.ndim == 3:
        lines = lines[:, 0]

    elif lines.ndim != 2 or lines.shape[1] != 4:
        raise RuntimeError(f"Unexpected line array shape: {lines.shape}")

    rows = []
    cs = []

    for x1, y1, x2, y2 in lines:

        a = float(y2 - y1)
        b = float(x1 - x2)

        norm = math.hypot(a, b)

        if norm == 0:
            continue

        a /= norm
        b /= norm
        c = -(a * x1 + b * y1)

        rows.append([a, b])
        cs.append(c)

    if len(rows) < 2:
        raise RuntimeError("Not enough lines to estimate origin.")

    sol, _, _, _ = np.linalg.lstsq(
        np.asarray(rows),
        -np.asarray(cs),
        rcond=None,
    )

    return float(sol[0]), float(sol[1])

# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC: diffraction g-vector detection (hybrid robust + precise)
# ══════════════════════════════════════════════════════════════════════════════

def detect_g_vectors(
    bgr: np.ndarray,
    min_length_fraction: float = 0.35,   # stricter filter for near-origin tips
    angle_merge_deg: float = 12.0,
    eps_values: list = [0.08, 0.12, 0.18, 0.25]  # dedicated sweep for angular clustering
) -> list:
    """
    Detect orange g-vector arrows in a diffraction-pattern image.
    Returns dicts with flat keys: ox, oy, tx, ty, vx, vy, length_px, angle_deg, g_id.
    """

    # Tighter HSV mask for orange arrows
    hsv  = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, (10, 100, 100), (20, 255, 255))

    # Morphological cleaning to connect faint arrow pixels
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask   = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)

    # Hough transform for line segments
    lines = cv2.HoughLinesP(mask, 1, np.pi / 180,
                            threshold=10, minLineLength=10, maxLineGap=8)
    if lines is None or len(lines) == 0:
        return []

    # Origin detection: endpoints + intersections
    ox1, oy1 = find_origin_by_endpoints(lines)
    try:
        ox2, oy2 = find_origin_by_intersections(lines)
        if abs(ox1 - ox2) + abs(oy1 - oy2) < 15:  # stricter tolerance
            ox, oy = int(round((ox1 + ox2) / 2)), int(round((oy1 + oy2) / 2))
        else:
            ox, oy = ox1, oy1
    except RuntimeError:
        ox, oy = ox1, oy1

    # Far-end tips only
    lines=np.asarray(lines)
    if lines.ndim == 3:
        lines = lines[:, 0]
    segs=lines
    tips = []
    for x1, y1, x2, y2 in segs:
        d1, d2 = np.hypot(x1 - ox, y1 - oy), np.hypot(x2 - ox, y2 - oy)
        tips.append([x1, y1] if d1 > d2 else [x2, y2])
    tips = np.array(tips, float)

    # Filter near-origin tips more aggressively
    dists = np.hypot(tips[:, 0] - ox, tips[:, 1] - oy)
    tips  = tips[dists > dists.max() * min_length_fraction]
    if len(tips) == 0:
        raise RuntimeError("All tips filtered out — try lowering min_length_fraction.")

    # Refine tips by snapping to brightest diffraction spot nearby
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    refined_tips = []
    for tip in tips:
        x, y = int(tip[0]), int(tip[1])
        roi = gray[max(0,y-6):y+7, max(0,x-6):x+7]  # 13x13 patch
        if roi.size > 0:
            _, _, _, maxLoc = cv2.minMaxLoc(roi)
            refined_tips.append([maxLoc[0] + x-6, maxLoc[1] + y-6])
        else:
            refined_tips.append([x,y])
    tips = np.array(refined_tips, float)

    # Dedicated DBSCAN sweep for angular clustering
    angles = np.arctan2(tips[:, 1] - oy, tips[:, 0] - ox).reshape(-1, 1)
    best_db, best_n = None, 0
    for eps in eps_values:
        db = DBSCAN(eps=eps, min_samples=1).fit(angles)
        n  = len(set(db.labels_)) - (1 if -1 in db.labels_ else 0)
        if n > best_n:
            best_n, best_db = n, db

    g_list = []
    seen = []

    for lbl in sorted(set(best_db.labels_)):
        if lbl == -1:
            continue
        cluster = tips[best_db.labels_ == lbl]
        tip     = cluster[np.hypot(cluster[:, 0] - ox, cluster[:, 1] - oy).argmax()]
        if any(np.linalg.norm(tip - t) < 15 for t in seen):
            continue
        seen.append(tip)

        tx, ty = int(tip[0]), int(tip[1])
        vx, vy = tx - ox, ty - oy
        g_list.append({
            "g_id": "",
            "ox": ox, "oy": oy,
            "tx": tx, "ty": ty,
            "vx": vx, "vy": vy,
            "length_px": round(float(np.hypot(vx, vy)), 2),
            "angle_deg": round(float(np.degrees(np.arctan2(vy, vx))), 2),
        })

    # Sort and merge within angle_merge_deg
    g_list.sort(key=lambda g: g["angle_deg"])
    merged = []
    for g in g_list:
        if merged and abs(g["angle_deg"] - merged[-1]["angle_deg"]) < angle_merge_deg:
            if g["length_px"] > merged[-1]["length_px"]:
                merged[-1] = g
        else:
            merged.append(g)

    for i, g in enumerate(merged, start=1):
        g["g_id"] = f"g{i:02d}"

    return merged

# ─────────────────────────────────────────────────────────────────────────────
# Matplotlib visualisations
# ─────────────────────────────────────────────────────────────────────────────

def _colour_to_mpl(cv_color_name: str, idx: int) -> str:
    """Map colour names to distinctive matplotlib hex colours."""
    _MAP = {
        "red":     "#ff2222",
        "orange":  "#ff9900",
        "yellow":  "#ffdd00",
        "green":   "#22cc22",
        "cyan":    "#00dddd",
        "blue":    "#2266ff",
        "magenta": "#dd22dd",
        "white":   "#eeeeee",
    }
    return _MAP.get(cv_color_name, PALETTE[idx % len(PALETTE)])


def show_detected_lines(
    image_path: str,
    lines:      List[dict],
    labels:     List[str],
    title:      str = "",
    output_dir: Optional[str] = None,
) -> None:
    """
    Display a TEM image with all detected lines overlaid.

    Each line is drawn in a colour matching its detected dislocation colour,
    labeled with its assigned ID (L1, L2, …), and listed in the legend.
    Close the window or press Enter to continue.

    Parameters
    ----------
    image_path : path to the TEM image.
    lines      : list of raw detection dicts from detect_all_lines().
    labels     : list of label strings ('L1', 'L2', …) same length as lines.
    title      : optional matplotlib window title.
    """
    try:
        import matplotlib
        matplotlib.use("Agg", force=True)
        import matplotlib.pyplot as plt
        import matplotlib.patches as mpatches
    except ImportError:
        logger.warning("matplotlib not installed — skipping visualisation.")
        return

    bgr = cv2.imread(image_path)
    if bgr is None:
        return
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    fig, ax = plt.subplots(figsize=(12, 9))
    ax.imshow(rgb)
    ax.set_title(
        title or (
            f"Detected dislocation lines — {os.path.basename(image_path)}\n"
            "Verify labels, then close window or press Enter to continue."
        ),
        fontsize=9, pad=6,
    )

    patches = []
    for i, (ln, lbl) in enumerate(zip(lines, labels)):
        col = _colour_to_mpl(ln["color"], i)
        p1  = (ln["x1"], ln["y1"])
        p2  = (ln["x2"], ln["y2"])

        ax.annotate(
            "", xy=(p2[0], p2[1]), xytext=(p1[0], p1[1]),
            arrowprops=dict(arrowstyle="->", color=col, lw=2.5), zorder=5,
        )
        mx = (p1[0] + p2[0]) // 2
        my = (p1[1] + p2[1]) // 2 - 16
        ax.text(mx, my, lbl, color=col, fontsize=12, fontweight="bold",
                ha="center", zorder=6,
                bbox=dict(boxstyle="round,pad=0.25", fc="black", alpha=0.55))
        patches.append(mpatches.Patch(
            color=col,
            label=f"{lbl}  [{ln['color']}]  "
                  f"v=({ln['vx']:+.0f},{ln['vy']:+.0f})  {ln['length_px']:.0f}px",
        ))

    if lines:
        ax.legend(handles=patches, loc="lower right", fontsize=8, framealpha=0.75)
    else:
        ax.text(0.5, 0.5, "No lines detected — try --min-px with a smaller value",
                transform=ax.transAxes, ha="center", color="red", fontsize=13)

    fig.canvas.mpl_connect(
        "key_press_event",
        lambda e: plt.close(fig) if e.key in ("enter", "escape") else None,
    )
    out_path = _resolve_output_path(image_path, output_dir, "images", "_annotated")
    fig.savefig(out_path, dpi=200, bbox_inches="tight")
    logger.info(f"Saved annotated TEM image → {out_path}")
    plt.tight_layout()
    plt.show(block=True)
    plt.close(fig)


def show_g_vectors(
    image_path: str,
    g_vecs:     List[dict],
    title:      str = "",
    output_dir: Optional[str] = None,
) -> None:
    """
    Display a diffraction image with detected g-vector arrows overlaid.

    Each arrow is labeled with its g-ID so the user can identify which
    arrow to assign [h k l] to in Stage 2 and which IDs to select in Stage 4.
    """
    try:
        import matplotlib
        matplotlib.use("Agg", force=True)
        import matplotlib.pyplot as plt
    except ImportError:
        return

    bgr = cv2.imread(image_path)
    if bgr is None:
        return
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    fig, ax = plt.subplots(figsize=(11, 8))
    ax.imshow(rgb)
    ax.set_title(
        title or (
            f"Detected g-vectors — {os.path.basename(image_path)}\n"
            "Note each arrow ID.  You will assign [h k l] per ID in Stage 2.\n"
            "Close window or press Enter to continue."
        ),
        fontsize=9, pad=6,
    )

    for i, g in enumerate(g_vecs):
        col = PALETTE[i % len(PALETTE)]
        ox = float(g.get("ox", g.get("origin_x_px", 0)))
        oy = float(g.get("oy", g.get("origin_y_px", 0)))
        tx = float(g.get("tx", g.get("tip_x_px", 0)))
        ty = float(g.get("ty", g.get("tip_y_px", 0)))
        gid = str(g.get("g_id", g.get("g_vector_id", "")))
        ax.annotate(
            "", xy=(tx, ty), xytext=(ox, oy),
            arrowprops=dict(arrowstyle="-|>", color=col, lw=2.5, mutation_scale=18),
            zorder=5,
        )
        ax.text(tx + 8, ty - 8, gid,
                color=col, fontsize=13, fontweight="bold", zorder=6,
                bbox=dict(boxstyle="round,pad=0.25", fc="black", alpha=0.65))

    if g_vecs:
        tbl = "g-ID   vx       vy     len(px)\n" + "─" * 32 + "\n"
        for g in g_vecs:
            vx = float(g.get("vx", g.get("vector_x", 0)))
            vy = float(g.get("vy", g.get("vector_y", 0)))
            length = float(g.get("length_px", 0))
            gid = str(g.get("g_id", g.get("g_vector_id", "")))
            tbl += f"{gid:<7}{vx:>8}  {vy:>8}  {length:>9.1f}\n"
        ax.text(0.01, 0.01, tbl, transform=ax.transAxes, fontsize=8,
                family="monospace", va="bottom", color="white",
                bbox=dict(boxstyle="round,pad=0.5", fc="black", alpha=0.70, ec="gray"))
    else:
        ax.text(0.5, 0.5, "No g-vectors detected",
                transform=ax.transAxes, ha="center", color="red", fontsize=14)

    fig.canvas.mpl_connect(
        "key_press_event",
        lambda e: plt.close(fig) if e.key in ("enter", "escape") else None,
    )
    out_path = _resolve_output_path(image_path, output_dir, "df", "_annotated")
    fig.savefig(out_path, dpi=200, bbox_inches="tight")
    logger.info(f"Saved annotated diffraction image → {out_path}")
    plt.tight_layout()
    plt.show(block=True)
    plt.close(fig)


def show_pair_guide(
    tem1_path: str,
    lines1:    List[dict],
    labels1:   List[str],
    tem2_path: str,
    lines2:    List[dict],
    labels2:   List[str],
    output_dir: Optional[str] = None,
) -> None:
    """
    Side-by-side view of both TEM images with line labels.
    Shown before Stage 3 so the user can identify IDs before typing pairs.
    """
    try:
        import matplotlib
        matplotlib.use("Agg", force=True)
        import matplotlib.pyplot as plt
        import matplotlib.patches as mpatches
    except ImportError:
        return

    fig, axes = plt.subplots(1, 2, figsize=(18, 8))
    for ax, img_path, lines, labels, title_lbl in [
        (axes[0], tem1_path, lines1, labels1, "TEM1"),
        (axes[1], tem2_path, lines2, labels2, "TEM2"),
    ]:
        bgr = cv2.imread(img_path)
        if bgr is None:
            ax.set_title(f"{title_lbl} — not found")
            continue
        ax.imshow(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        ax.set_title(f"{title_lbl}: {os.path.basename(img_path)}", fontsize=9)
        patches = []
        for i, (ln, lbl) in enumerate(zip(lines, labels)):
            col = _colour_to_mpl(ln["color"], i)
            ax.annotate(
                "", xy=(ln["x2"], ln["y2"]), xytext=(ln["x1"], ln["y1"]),
                arrowprops=dict(arrowstyle="->", color=col, lw=2.5), zorder=5,
            )
            mx = (ln["x1"] + ln["x2"]) // 2
            my = (ln["y1"] + ln["y2"]) // 2 - 16
            ax.text(mx, my, lbl, color=col, fontsize=12, fontweight="bold",
                    ha="center", zorder=6,
                    bbox=dict(boxstyle="round,pad=0.25", fc="black", alpha=0.55))
            patches.append(mpatches.Patch(color=col,
                label=f"{lbl} [{ln['color']}]"))
        if patches:
            ax.legend(handles=patches, loc="lower right", fontsize=9, framealpha=0.75)

    fig.suptitle(
        "Review line labels — close this window to enter pairs in the terminal",
        fontsize=10,
    )
    fig.canvas.mpl_connect(
        "key_press_event",
        lambda e: plt.close(fig) if e.key in ("enter", "escape") else None,
    )
    base_dir = Path(output_dir) if output_dir else Path(__file__).resolve().parent / "outputs"
    guide_dir = base_dir / "pair_guides"
    guide_dir.mkdir(parents=True, exist_ok=True)
    guide_path = guide_dir / f"{Path(tem1_path).stem}__{Path(tem2_path).stem}_guide.png"
    fig.savefig(guide_path, dpi=200, bbox_inches="tight")
    logger.info(f"Saved pair guide image → {guide_path}")
    plt.tight_layout()
    plt.show(block=True)
    plt.close(fig)
