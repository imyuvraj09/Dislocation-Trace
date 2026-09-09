"""
modules/angle_calculator.py
============================
Stage 4 — pixel-space angle computation.

Key design constraint
---------------------
Angles are computed from PIXEL vectors only (line endpoint coordinates and
g-vector pixel arrows).  Miller indices [h k l] are NOT used here; they are
reserved for Stage 6 where they form the equation matrix.

Public API
----------
compute_pixel_angle(line_vx, line_vy, g_vx, g_vy)
    → (raw_deg, acute_deg)

compute_angles_for_selection(line, gvecs, selected_ids, pair_id)
    → List[AngleRow]

compute_all_pair_angles(pairs, lines_by_img, gvecs_by_img, selections, tem_to_diff)
    → List[AngleRow]
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import numpy as np

from .pipeline_types import AngleRow, DetectedLine, GVector, GVecSelection, LinePair


# ══════════════════════════════════════════════════════════════════════════════
# CORE ANGLE MATH
# ══════════════════════════════════════════════════════════════════════════════

def compute_pixel_angle(
    line_vx: float, line_vy: float,
    g_vx:    float, g_vy:    float,
) -> Tuple[float, float]:
    """
    Compute the raw and acute angles between a dislocation-line pixel vector
    and a g-vector pixel arrow.

    Inputs are 2-D pixel vectors; no crystallographic information is used.

    Parameters
    ----------
    line_vx, line_vy : components of the line vector  (x2-x1, y2-y1).
    g_vx, g_vy       : components of the g-vector arrow  (tip - origin).

    Returns
    -------
    raw_deg   : angle in [0°, 180°].
    acute_deg : angle folded into [0°, 90°]  (what enters Stage 6).

    Notes
    -----
    The acute fold is necessary because the measured image angle has a
    180° ambiguity (the line has no intrinsic direction), and Stage 6 uses
    a sign search (±cos θ) to resolve the ambiguity algebraically.
    """
    lv = np.array([line_vx, line_vy], dtype=float)
    gv = np.array([g_vx,    g_vy],    dtype=float)
    n1, n2 = np.linalg.norm(lv), np.linalg.norm(gv)
    if n1 < 1e-12 or n2 < 1e-12:
        return float("nan"), float("nan")
    cos_val  = float(np.dot(lv, gv) / (n1 * n2))
    cos_val  = max(-1.0, min(1.0, cos_val))        # clamp numerical noise
    raw_deg  = math.degrees(math.acos(cos_val))
    acute_deg = _fold_acute(raw_deg)
    return round(raw_deg, 1), round(acute_deg, 1)


def _fold_acute(theta_deg: float) -> float:
    """Fold any angle into [0°, 90°]."""
    a = abs(theta_deg) % 180.0
    return a if a <= 90.0 else 180.0 - a


# ══════════════════════════════════════════════════════════════════════════════
# PER-SELECTION COMPUTATION
# ══════════════════════════════════════════════════════════════════════════════

def compute_angles_for_selection(
    line:         DetectedLine,
    gvecs:        List[GVector],
    selected_ids: List[str],
    pair_id:      str,
) -> List[AngleRow]:
    """
    Compute pixel-space angles between *line* and exactly the g-vectors
    whose IDs are in *selected_ids*.

    Parameters
    ----------
    line         : the dislocation line (pixel vector taken from .vx, .vy).
    gvecs        : all GVector objects for the corresponding diff image.
    selected_ids : exactly 3 g-IDs chosen by the user in Stage 4.
    pair_id      : "P1", "P2", …

    Returns
    -------
    List of AngleRow — one per selected g-vector.
    Order matches *selected_ids* to preserve consistency with Stage 6.
    """
    gvec_map: Dict[str, GVector] = {g.g_id: g for g in gvecs}
    rows: List[AngleRow] = []

    for gid in selected_ids:
        g = gvec_map.get(gid)
        if g is None:
            raise KeyError(
                f"g-vector '{gid}' not found in diff image '{gvecs[0].source if gvecs else '?'}'. "
                f"Available: {list(gvec_map)}"
            )
        raw, acute = compute_pixel_angle(line.vx, line.vy, g.vx, g.vy)
        rows.append(AngleRow(
            pair_id=pair_id, image=line.image, line_id=line.label,
            g_id=gid,
            line_vx=line.vx, line_vy=line.vy,
            g_vx=g.vx,       g_vy=g.vy,
            raw_deg=raw,      acute_deg=acute,
        ))
    return rows


# ══════════════════════════════════════════════════════════════════════════════
# BATCH COMPUTATION OVER ALL PAIRS
# ══════════════════════════════════════════════════════════════════════════════

def compute_all_pair_angles(
    pairs:        List[LinePair],
    lines_by_img: Dict[str, List[DetectedLine]],
    gvecs_by_img: Dict[str, List[GVector]],
    selections:   List[GVecSelection],
    tem_to_diff:  Dict[str, str],
) -> List[AngleRow]:
    """
    Compute pixel-space angles for every (pair, image) combination using
    only the g-vectors that were explicitly selected in Stage 4.

    Parameters
    ----------
    pairs        : list of LinePair from Stage 3.
    lines_by_img : {TEM_basename → [DetectedLine]} from Stage 1.
    gvecs_by_img : {diff_basename → [GVector]}     from Stage 1/2.
    selections   : list of GVecSelection from Stage 4 (user choices).
    tem_to_diff  : {TEM_basename → diff_basename}  mapping.

    Returns
    -------
    All AngleRow objects in pair/image order.
    """
    # Index selections for fast lookup: (pair_id, image) → GVecSelection
    sel_index: Dict[Tuple[str, str], GVecSelection] = {
        (s.pair_id, s.image): s for s in selections
    }

    all_rows: List[AngleRow] = []

    for pair in pairs:
        for dl in (pair.line1, pair.line2):
            sel = sel_index.get((pair.pair_id, dl.image))
            if sel is None:
                raise RuntimeError(
                    f"No g-vector selection found for pair {pair.pair_id}, "
                    f"image {dl.image}. Run Stage 4 first."
                )
            diff_name = tem_to_diff.get(dl.image, dl.image)
            gvecs     = gvecs_by_img.get(Path_basename(diff_name), [])
            rows      = compute_angles_for_selection(dl, gvecs, sel.g_ids, pair.pair_id)
            all_rows.extend(rows)

    return all_rows


# ══════════════════════════════════════════════════════════════════════════════
# FORMATTING HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def format_angle_table(
    rows:     List[AngleRow],
    pair_id:  Optional[str] = None,
    image:    Optional[str] = None,
) -> str:
    """
    Format an angle table as a string for display.

    Optionally filter by pair_id and/or image basename.
    """
    filtered = [
        r for r in rows
        if (pair_id is None or r.pair_id == pair_id)
        and (image   is None or r.image   == image)
    ]
    if not filtered:
        return "  (no angle rows)\n"

    hdr = (f"  {'Pair':>5}  {'Image':>20}  {'Line':>6}  "
           f"{'g-ID':>6}  {'line vec':>14}  {'g vec':>14}  "
           f"{'raw°':>8}  {'acute°':>8}")
    sep = "  " + "─" * (len(hdr) - 2)
    lines = [hdr, sep]
    for r in filtered:
        lv = f"({r.line_vx:+4d},{r.line_vy:+4d})"
        gv = f"({r.g_vx:+4d},{r.g_vy:+4d})"
        lines.append(
            f"  {r.pair_id:>5}  {r.image:>20}  {r.line_id:>6}  "
            f"{r.g_id:>6}  {lv:>14}  {gv:>14}  "
            f"{r.raw_deg:8.3f}  {r.acute_deg:8.3f}"
        )
    return "\n".join(lines) + "\n"


# ══════════════════════════════════════════════════════════════════════════════
# TINY UTILITY (avoids importing pathlib inside this module's logic)
# ══════════════════════════════════════════════════════════════════════════════

def Path_basename(p: str) -> str:
    """Return the basename of a path string without importing pathlib."""
    return p.replace("\\", "/").split("/")[-1]