"""
modules/true_line_solver.py
============================
Stage 7 — reconstruct the true 3-D dislocation line direction.

Geometry
--------
The projected direction Up_i is the projection of the true line U onto
the plane perpendicular to beam B_i.  Therefore Up_i and B_i together
span a plane whose normal is n_i = Up_i × B_i.  The true line U lies in
both planes, so:

    n1  = Up1 × B1
    n2  = Up2 × B2
    U   = n1  × n2         (intersection of the two planes)

U is then normalised and reduced to the smallest integer Miller index.

Public API
----------
compute_true_line(sr1, sr2)  → TrueLineResult
reduce_miller(v)              → Tuple[int, int, int]
"""

from __future__ import annotations

from functools import reduce as _fred
from math import gcd
from typing import Optional, Tuple

import numpy as np

from .pipeline_types import SolveResult, TrueLineResult
from crystallography.geometry import CrystalGeometry


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC
# ══════════════════════════════════════════════════════════════════════════════

def compute_true_line(sr1: SolveResult, sr2: SolveResult) -> TrueLineResult:
    """
    Compute the true dislocation line direction from two Up vectors.

    Parameters
    ----------
    sr1 : SolveResult for the line in TEM image 1 (contains Up1_norm and B1).
    sr2 : SolveResult for the line in TEM image 2 (contains Up2_norm and B2).

    Returns
    -------
    TrueLineResult with:
        n1, n2    — plane normals
        U_raw     — cross-product before normalisation
        U_norm    — unit vector
        U_miller  — GCD-reduced integer Miller index
    """
    if sr1.pair_id != sr2.pair_id:
        raise ValueError(
            f"SolveResults belong to different pairs: {sr1.pair_id} vs {sr2.pair_id}."
        )
    if sr1.crystal_system != sr2.crystal_system:
        raise ValueError(
            f"SolveResults use different crystal systems: {sr1.crystal_system} vs {sr2.crystal_system}."
        )
    if sr1.crystal_system != "cubic" and not np.isclose(
        float(sr1.c_over_a), float(sr2.c_over_a), atol=1e-12
    ):
        raise ValueError(
            f"SolveResults use different c/a ratios: {sr1.c_over_a} vs {sr2.c_over_a}."
        )

    Up1 = sr1.Up_norm
    Up2 = sr2.Up_norm
    B1  = sr1.B
    B2  = sr2.B

    n1    = np.cross(Up1, B1)
    n2    = np.cross(Up2, B2)
    U_raw = np.cross(n1, n2)

    if np.linalg.norm(U_raw) < 1e-12:
        # Fallback: the two planes are parallel (degenerate case)
        # Use the average of the two Up vectors projected into 3D
        U_raw = (Up1 + Up2) / 2.0

    U_norm = _normalise(U_raw)
    if sr1.crystal_system == "cubic":
        # Preserve the original cubic indexing path exactly.
        U_miller = reduce_miller(U_norm)
    else:
        geometry = CrystalGeometry(sr1.crystal_system, sr1.c_over_a)
        U_miller = geometry.index_true_line_direction(U_norm)


    return TrueLineResult(
        pair_id=sr1.pair_id,
        n1=n1, n2=n2,
        U_raw=U_raw, U_norm=U_norm,
        U_miller=U_miller,
        crystal_system=sr1.crystal_system,
        c_over_a=sr1.c_over_a,
    )


def reconstruct_pair_dislocation_line(
    pair_id: str,
    img1_name: str,
    img2_name: str,
    u_up1: np.ndarray,
    u_up2: np.ndarray,
    line1_acute_deg: float,
    line2_acute_deg: float,
    g1_cart: np.ndarray,
    g2_cart: np.ndarray,
    crystal_system: str = "cubic",
    c_over_a: Optional[float] = None,
) -> TrueLineResult:
    """Helper function to construct SolveResults from line acute angles and compute 3D true dislocation line."""
    def _projected_up_vector(g_cart: np.ndarray, B: np.ndarray, angle_deg: float) -> np.ndarray:
        B_norm = _normalise(B)
        g_proj = g_cart - np.dot(g_cart, B_norm) * B_norm
        if np.linalg.norm(g_proj) < 1e-12:
            ref = np.array([1.0, 0.0, 0.0]) if abs(B_norm[0]) < 0.8 else np.array([0.0, 1.0, 0.0])
            g_proj = ref - np.dot(ref, B_norm) * B_norm
        u_g = _normalise(g_proj)
        u_perp = _normalise(np.cross(B_norm, u_g))
        rad = np.radians(angle_deg)
        return _normalise(np.cos(rad) * u_g + np.sin(rad) * u_perp)

    Up1 = _projected_up_vector(g1_cart, u_up1, line1_acute_deg)
    Up2 = _projected_up_vector(g2_cart, u_up2, line2_acute_deg)

    sr1 = SolveResult(
        pair_id=pair_id,
        image=img1_name,
        line_id="L1",
        Up_raw=Up1,
        Up_norm=Up1,
        B=_normalise(u_up1),
        rank=3,
        signs=(1, 1, 1),
        used_fix=False,
        residual=0.0,
        method="test",
        crystal_system=crystal_system,
        c_over_a=c_over_a,
    )
    sr2 = SolveResult(
        pair_id=pair_id,
        image=img2_name,
        line_id="L2",
        Up_raw=Up2,
        Up_norm=Up2,
        B=_normalise(u_up2),
        rank=3,
        signs=(1, 1, 1),
        used_fix=False,
        residual=0.0,
        method="test",
        crystal_system=crystal_system,
        c_over_a=c_over_a,
    )

    return compute_true_line(sr1, sr2)


def reduce_miller(v: np.ndarray) -> Optional[Tuple[int, int, int]]:
    """
    Reduce a float 3-vector to its smallest-integer Miller-index form.

    Algorithm
    ---------
    1. If all components are effectively zero (|v| < ε), return None
       — the caller is responsible for interpreting that as
       "undefined" rather than a valid crystallographic direction.
    2. Round to integers and divide by GCD if all three are already
       near-integers.
    3. Otherwise, multiply by 1 … 24 to clear fractions, then divide by GCD.
    4. If no multiplier works, scale by 1/min(|v_i|) to clear the smallest
       component, then GCD-reduce.
    5. Fall back to plain rounding if no exact multiplier is found.
    6. Never returns (0, 0, 0) — returns None instead.

    Returns
    -------
    (h, k, l) as a tuple of Python ints, or None if reduction fails.
    """
    v = np.asarray(v, dtype=float)

    # Guard: zero-length vector → nothing to reduce.
    if np.linalg.norm(v) < 1e-10:
        return None

    ints = np.round(v).astype(int)
    if np.allclose(v, ints, atol=1e-6):
        nz = [abs(int(x)) for x in ints if x != 0]
        g  = _fred(gcd, nz) if nz else 1
        result = tuple(int(x) // g for x in ints)
        if result != (0, 0, 0):
            return result                              # type: ignore[return-value]
    for mult in range(1, 25):
        s  = v * mult
        i2 = np.round(s).astype(int)
        if np.allclose(s, i2, atol=1e-6):
            nz = [abs(int(x)) for x in i2 if x != 0]
            if nz:
                g = _fred(gcd, nz)
                result = tuple(int(x) // g for x in i2)
                if result != (0, 0, 0):
                    return result                      # type: ignore[return-value]

    # Scale by 1/min(|v_i|) for the smallest non-zero component to clear
    # fractions that the integer multiplier loop missed.
    abs_v = np.abs(v)
    nz_mask = abs_v > 1e-10
    if np.any(nz_mask):
        scale = 1.0 / np.min(abs_v[nz_mask])
        scaled = v * scale
        ints2 = np.round(scaled).astype(int)
        if np.allclose(scaled, ints2, atol=1e-4):
            nz2 = [abs(int(x)) for x in ints2 if x != 0]
            if nz2:
                g2 = _fred(gcd, nz2)
                result2 = tuple(int(x) // g2 for x in ints2)
                if result2 != (0, 0, 0):
                    return result2                     # type: ignore[return-value]

    # Last resort: plain rounding — but reject (0,0,0).
    fallback = tuple(int(x) for x in np.round(v))
    return fallback if fallback != (0, 0, 0) else None  # type: ignore[return-value]



# ══════════════════════════════════════════════════════════════════════════════
# FORMATTING
# ══════════════════════════════════════════════════════════════════════════════

def format_true_line(tl: TrueLineResult) -> str:
    """Return a multi-line console summary for one TrueLineResult."""
    nz = [abs(float(x)) for x in tl.U_norm if abs(float(x)) > 1e-6]
    ratio = (
        tuple(round(float(x) / min(nz), 3) for x in tl.U_norm)
        if nz else (0.0, 0.0, 0.0)
    )
    lines = [
        f"  Pair {tl.pair_id}  —  True Dislocation Line",
        f"  {'─' * 60}",
        f"  n1 = Up1 × B1  =  [{' '.join(f'{x:+.2f}' for x in tl.n1)}]",
        f"  n2 = Up2 × B2  =  [{' '.join(f'{x:+.2f}' for x in tl.n2)}]",
        f"  U  = n1  × n2  =  [{' '.join(f'{x:+.2f}' for x in tl.U_raw)}]",
        f"  U  (norm)      =  [{' '.join(f'{x:+.2f}' for x in tl.U_norm)}]",
        f"  U  (Miller)    =  {tl.U_miller}",
        f"  U  (ratio)     =  {ratio}",
    ]
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# PRIVATE
# ══════════════════════════════════════════════════════════════════════════════

def _normalise(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v.copy()
