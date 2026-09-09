"""
crystallography/matrix_math.py
================================
Ported from g.b's `math/matrix.js` (window.MatrixUtils) -- Reduced Row
Echelon Form and null-space basis, used by solver.py to characterize how
many independent constraints the user's "invisible" (g.b = 0) g-vector
observations impose on a Burgers vector, and to report the null-space
basis for the derivation shown to the user.

Direct, line-for-line port (including its iterative RREF/back-substitution
style) rather than delegating to numpy/scipy, so behavior matches the
original JS exactly (same tie-breaking, same 1e-9/1e-7 tolerances).
"""

from __future__ import annotations

from typing import List

Matrix = List[List[float]]


def rref(mat: Matrix) -> Matrix:
    """Reduced Row Echelon Form of `mat` (list of rows). Does not mutate input."""
    m = len(mat)
    if m == 0:
        return []
    n = len(mat[0])

    a = [list(row) for row in mat]

    lead = 0
    for r in range(m):
        if lead >= n:
            break
        i = r
        while abs(a[i][lead]) < 1e-9:
            i += 1
            if i == m:
                i = r
                lead += 1
                if lead == n:
                    return a

        a[i], a[r] = a[r], a[i]

        val = a[r][lead]
        for j in range(n):
            a[r][j] /= val

        for k in range(m):
            if k != r:
                factor = a[k][lead]
                for j in range(n):
                    a[k][j] -= factor * a[r][j]

        lead += 1

    return a


def null_space(a: Matrix) -> List[List[float]]:
    """Null-space basis vectors for A.b = 0.

    In this context A has m rows (input g-vectors, one per "invisible"
    observation) and exactly 3 columns (bx, by, bz).
    """
    rref_a = rref(a)
    m = len(rref_a)
    n = 3

    pivot_rows: List[int] = []
    pivot_cols: List[int] = []
    for r in range(m):
        lead_col = -1
        for c in range(n):
            if abs(rref_a[r][c] - 1) < 1e-7:
                is_pivot = True
                for j in range(c):
                    if abs(rref_a[r][j]) > 1e-7:
                        is_pivot = False
                        break
                if is_pivot:
                    lead_col = c
                    break
        if lead_col != -1:
            pivot_rows.append(r)
            pivot_cols.append(lead_col)

    rank = len(pivot_cols)
    free_cols = [c for c in range(n) if c not in pivot_cols]

    if rank == 3:
        return []

    basis: List[List[float]] = []
    for f in free_cols:
        vec = [0.0, 0.0, 0.0]
        vec[f] = 1.0
        for i in range(rank):
            p_col = pivot_cols[i]
            p_row = pivot_rows[i]
            vec[p_col] = -rref_a[p_row][f]
        basis.append(vec)

    return basis
