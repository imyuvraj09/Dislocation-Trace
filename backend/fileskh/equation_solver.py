"""
modules/equation_solver.py
===========================
Stage 6 — solve  [ĝ₁; ĝ₂; ĝ₃] · Up = [±cos θ₁; ±cos θ₂; ±cos θ₃]
for the projected dislocation direction Up.

Design notes
------------
Equation formation
    Row i of matrix A  =  the normalized Cartesian reciprocal-space vector
    corresponding to the selected plane indices.
    RHS entry i        =  ±cos(θ_i)          where θ_i is the acute pixel angle.

Sign search
    The measured acute angle θ ∈ [0°, 90°] means cos θ ≥ 0, but the true
    signed angle between Up and ĝ_i might be obtuse.  We try all 2^3 = 8
    sign combinations of the RHS and pick the one that gives the smallest
    least-squares residual.

Rank check and zone-axis augmentation
    If rank(A) < 3 (e.g. all three g-vectors lie in the same zone), the
    system is under-determined.  We augment with the zone-axis constraint:

        B · Up = 0   (Up lies in the plane perpendicular to the beam)

    appended as an extra row, and solve the resulting (4×3) system with lstsq.

Public API
----------
solve_Up(selected_gvecs, angle_rows, B, pair_id, image, line_id)
    → SolveResult

build_equation_matrix(gvecs, thetas)
    → (A, b)   3×3 matrix and RHS vector

diagnose_rank(A, B)
    → dict  with rank, singular values, null vector, cause description
"""

from __future__ import annotations

import itertools
import math
from typing import Dict, List, Optional, Tuple

import numpy as np

from .pipeline_types import AngleRow, GVector, SolveResult
from crystallography.geometry import CrystalGeometry


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC — main solver
# ══════════════════════════════════════════════════════════════════════════════

def solve_Up(
    selected_gvecs: List[GVector],
    angle_rows:     List[AngleRow],
    B:              np.ndarray,
    pair_id:        str,
    image:          str,
    line_id:        str,
    force_zone:     bool = False,
    crystal_system: str = "cubic",
    c_over_a:       Optional[float] = None,
) -> SolveResult:
    """
    Solve  ĝᵢ · Up = ±cos θᵢ   for the projected dislocation direction Up.

    Parameters
    ----------
    selected_gvecs : exactly 3 GVector objects (must have .hkl set).
    angle_rows     : angle rows for this (pair_id, image) — filtered internally.
    B              : beam direction / zone-axis indices. HCP uses [u v t w].
    pair_id, image, line_id : identifiers forwarded to SolveResult.
    force_zone     : if True, always append the zone-axis row even when rank = 3.

    Returns
    -------
    SolveResult  with Up_raw, Up_norm, rank, signs, used_fix, residual, method.

    Raises
    ------
    ValueError  if fewer than 3 g-vectors have hkl set, or if angle rows
                for the selected g-IDs cannot be found.
    """
    geometry = CrystalGeometry(crystal_system, c_over_a)

    # ── Validate inputs ──────────────────────────────────────────────────────
    if len(selected_gvecs) != 3:
        raise ValueError(f"Need exactly 3 g-vectors, got {len(selected_gvecs)}.")
    missing_hkl = [g.g_id for g in selected_gvecs if g.hkl is None]
    if missing_hkl:
        raise ValueError(
            f"Miller indices not set for g-vectors: {missing_hkl}. "
            "Run Stage 2 (Miller index labeling) first."
        )

    # ── Build θ vector from angle rows ───────────────────────────────────────
    row_by_gid: Dict[str, AngleRow] = {
        r.g_id: r for r in angle_rows
        if r.pair_id == pair_id and r.image == image
    }
    thetas: List[float] = []
    for g in selected_gvecs:
        row = row_by_gid.get(g.g_id)
        if row is None:
            raise ValueError(
                f"No angle row found for pair={pair_id}, image={image}, g={g.g_id}. "
                "Ensure Stage 4 ran successfully."
            )
        thetas.append(row.acute_deg)

    # ── Build equation matrix ─────────────────────────────────────────────────
    A, b_vec = build_equation_matrix(
        selected_gvecs,
        thetas,
        crystal_system=geometry.crystal_system,
        c_over_a=geometry.c_over_a,
    )

    B_indices = np.asarray(B, dtype=float)
    B_cart = geometry.direction_to_cartesian(B_indices)
    # The old cubic path used the literal zone-axis triple. Preserve it
    # exactly. For non-cubic systems, normalize the converted Cartesian row
    # so c/a does not arbitrarily weight the augmented least-squares system.
    B_solver = B_cart if geometry.crystal_system == "cubic" else _normalise(B_cart)

    # ── Rank diagnosis ────────────────────────────────────────────────────────
    rank     = np.linalg.matrix_rank(A)
    need_fix = (rank < 3) or force_zone

    # ── Sign search over all 2^3 = 8 combinations ────────────────────────────
    best_sol, best_signs, best_resid, best_fix = None, None, math.inf, False
    for signs in itertools.product([1, -1], repeat=len(b_vec)):
        rhs = np.array([s * v for s, v in zip(signs, b_vec)])
        sol, fix = _lstsq_solve(A, rhs, B_solver, need_fix)
        resid = float(np.sqrt(np.mean((A @ sol - rhs) ** 2)))
        if resid < best_resid:
            best_sol, best_signs, best_resid, best_fix = sol, signs, resid, fix

    Up_raw  = best_sol                          # type: ignore[arg-type]
    Up_norm = _normalise(Up_raw)
    method  = (
        f"Zone-axis augmented lstsq  (rank {rank}/3, Up·B = {float(np.dot(Up_norm, B_solver)):.2e})"
        if best_fix
        else f"Direct lstsq (full rank {rank}/3)"
    )

    return SolveResult(
        pair_id=pair_id, image=image, line_id=line_id,
        Up_raw=Up_raw, Up_norm=Up_norm, B=B_solver.copy(),
        rank=rank, signs=best_signs,           # type: ignore[arg-type]
        used_fix=best_fix, residual=best_resid,
        method=method,
        crystal_system=geometry.crystal_system,
        c_over_a=geometry.c_over_a,
        B_indices=tuple(float(x) for x in B_indices),
    )


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC — equation matrix builder
# ══════════════════════════════════════════════════════════════════════════════

def build_equation_matrix(
    gvecs:  List[GVector],
    thetas: List[float],
    crystal_system: str = "cubic",
    c_over_a: Optional[float] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build the 3×3 equation matrix A and RHS vector b.

        A[i]  = normalise(hkl_i)          — unit Miller index direction
        b[i]  = cos(θ_acute_i)            — signed later in sign search

    Parameters
    ----------
    gvecs  : list of GVector objects (must have .hkl set).
    thetas : corresponding list of acute angles in degrees (from angle_rows).

    Returns
    -------
    A  : (N×3) float array — N = len(gvecs) (typically 3).
    b  : (N,)  float array — cos of each acute angle.
    """
    if len(gvecs) != len(thetas):
        raise ValueError(f"Mismatched lengths: {len(gvecs)} g-vecs vs {len(thetas)} angles.")
    geometry = CrystalGeometry(crystal_system, c_over_a)
    rows, rhs = [], []
    for g, theta in zip(gvecs, thetas):
        g_cart = geometry.plane_to_cartesian(g.hkl)
        rows.append(_normalise(g_cart))
        rhs.append(math.cos(math.radians(theta)))
    return np.array(rows, dtype=float), np.array(rhs, dtype=float)


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC — rank diagnostics
# ══════════════════════════════════════════════════════════════════════════════

def diagnose_rank(A: np.ndarray, B: np.ndarray) -> dict:
    """
    Full rank-deficiency diagnosis of the equation matrix.

    Returns a dict:
        rank              : integer rank of A.
        singular_values   : list of SVD singular values.
        zero_cols         : names of zero columns  (["h (ux)", …]).
        null_vec          : first null-space vector (if any).
        cause             : human-readable description of the deficiency.
        zone_fix_expected : True if Up·B=0 is expected to resolve the issue.
    """
    rank      = np.linalg.matrix_rank(A)
    _, S, Vt  = np.linalg.svd(A)
    tol       = 1e-10 * S[0] if S[0] > 0 else 1e-10
    zero_cols = [j for j in range(A.shape[1]) if np.all(np.abs(A[:, j]) < tol)]
    null_vecs = Vt[np.abs(S) < tol]
    null_vec  = null_vecs[0] if len(null_vecs) else np.zeros(3)

    coord_names = ["h (ux)", "k (uy)", "l (uz)"]
    is_zero_col = len(zero_cols) > 0
    is_lin_dep  = (rank < 3) and not is_zero_col

    # Is the null direction parallel to B?  If yes, Up·B=0 will fix it.
    B_hat  = _normalise(B)
    nv_hat = _normalise(null_vec)
    zone_fix_expected = (
        np.linalg.norm(B) > 1e-12
        and abs(abs(float(np.dot(nv_hat, B_hat))) - 1.0) < 0.05
    )

    if is_zero_col:
        cause = (
            f"Zero column(s): {[coord_names[j] for j in zero_cols]}. "
            "This component is invisible along the current beam direction."
        )
    elif is_lin_dep:
        cause = (
            f"Linear dependence: all 3 g-vectors lie in the same zone. "
            f"Null direction ≈ {tuple(round(x,3) for x in null_vec)}."
        )
    else:
        cause = "Full rank — no deficiency."

    return {
        "rank":               rank,
        "singular_values":    S.tolist(),
        "zero_cols":          [coord_names[j] for j in zero_cols],
        "null_vec":           null_vec.tolist(),
        "cause":              cause,
        "zone_fix_expected":  zone_fix_expected,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PRIVATE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _lstsq_solve(
    A:        np.ndarray,
    rhs:      np.ndarray,
    B:        np.ndarray,
    need_fix: bool,
) -> Tuple[np.ndarray, bool]:
    """
    Solve A·x ≈ rhs via lstsq.  If need_fix, first append the zone-axis row.

    Returns (solution, used_fix_flag).
    """
    if need_fix:
        A_aug   = np.vstack([A, B.reshape(1, 3)])
        rhs_aug = np.append(rhs, 0.0)
        sol, _, _, _ = np.linalg.lstsq(A_aug, rhs_aug, rcond=None)
        return sol, True
    sol, _, _, _ = np.linalg.lstsq(A, rhs, rcond=None)
    return sol, False


def _normalise(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v.copy()


# ══════════════════════════════════════════════════════════════════════════════
# FORMATTING
# ══════════════════════════════════════════════════════════════════════════════

def format_solve_result(sr: SolveResult) -> str:
    """Return a multi-line string summarising one SolveResult for console display."""
    lines = [
        f"  Pair {sr.pair_id}  |  {sr.image}  /  {sr.line_id}",
        f"  {'─' * 60}",
        f"  Rank          : {sr.rank}/3",
        f"  Zone-axis fix : {'yes  (Up·B=0 appended)' if sr.used_fix else 'no'}",
        f"  Method        : {sr.method}",
        f"  Best signs    : {sr.signs}",
        f"  Up (raw)      : [{' '.join(f'{x:+.2f}' for x in sr.Up_raw)}]",
        f"  Up (norm)     : [{' '.join(f'{x:+.2f}' for x in sr.Up_norm)}]",
        f"  Up · B        : {float(np.dot(sr.Up_norm, sr.B)):.3e}",
        f"  RMS residual  : {sr.residual:.4e}",
    ]
    return "\n".join(lines)
