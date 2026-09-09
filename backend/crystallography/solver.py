"""
crystallography/solver.py
===========================
Ported from g.b's `math/solver.js` (window.BurgersSolver.solve). This is
the one piece of "automatic" logic in the crystallography reference
system, and it does exactly what the original did: given a set of
experimentally *invisible* g-vectors (g.b = 0) and, optionally,
experimentally *visible* g-vectors (g.b != 0), it filters the material's
own crystallographically-allowed Burgers-vector family down to the
candidates consistent with every observation -- it does not invent a
vector outside that family, and it never picks a candidate for the user
when more than one remains consistent (see queries.solve_candidates and
its caller in app/routers/stage8_classify.py for how ties are surfaced
back to the user).

Differences from the original, and why
---------------------------------------
* The original also accepted arbitrary hand-typed g-vectors and searched
  every dataset's b_vectors; CrystalTrace only ever calls this with the
  Miller indices the user already assigned in Stage 2 and the material
  they selected, so the signature takes a `CrystalStructure` (from
  loader.py) instead of a raw dataset dict.
* CrystalTrace's g.b observations are recorded as a symbolic {+1, 0, -1}
  per the STAGE 7 REDESIGN spec, not a raw integer. Consistent with the
  original algorithm (which only ever tested "== 0" vs "!= 0", never a
  specific nonzero value or sign), a "0" observation is treated as an
  invisible constraint and a "+1"/"-1" observation is treated as a
  visible constraint. The recorded sign is kept as experimental metadata
  (GBObservationInput.gb) but is not used to further filter candidates,
  since the ported algorithm has no such rule and inventing one here
  would not be "porting", it would be a new (unvalidated) criterion.
* Output is plain dataclasses (models.BurgersCandidate / SolveResult)
  instead of a Markdown+LaTeX string assembled ad hoc; `math_derivation`
  is still produced (same structure, same four sections) since it's
  useful as a transparent, reproducible audit trail of the calculation,
  which the scientific design philosophy in the spec asks for.
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

from . import matrix_math, vector_math
from .geometry import CrystalGeometry
from .models import BurgersCandidate, CrystalStructure, SolveResult

IndexVector = Tuple[float, ...]
Vec3 = Tuple[float, float, float]

_EPS = 1e-7


def solve(
    structure: CrystalStructure,
    invisible_g: Sequence[IndexVector],
    visible_g: Sequence[IndexVector] = (),
) -> SolveResult:
    """Direct port of BurgersSolver.solve(crystalKey, dataset, invisibleG, visibleG)."""
    total_constraints = len(invisible_g) + len(visible_g)
    if total_constraints == 0:
        return SolveResult(candidates=[], math_derivation="No constraints provided.", null_space_basis=[])

    derivation: List[str] = []
    derivation.append("### 1. Mathematical Constraints Setup\n")
    if structure.crystal_system == "hcp":
        derivation.append("We define the HCP Burgers direction in Miller--Bravais form b = [u, v, t, w].")
    else:
        derivation.append("We define the Burgers vector b = [bx, by, bz].")
    derivation.append(
        "Experimental TEM invisibility conditions require that g . b = 0 "
        "for every invisible diffraction condition.\n"
    )
    for idx, g in enumerate(invisible_g, start=1):
        derivation.append(_format_equation(g, idx, is_visible=False))
    if visible_g:
        derivation.append("\nAdditionally, visible conditions require g . b != 0:\n")
        for idx, g in enumerate(visible_g, start=len(invisible_g) + 1):
            derivation.append(_format_equation(g, idx, is_visible=True))

    # c/a does not change the exact zone-law condition g·b = 0. A unit
    # ratio is therefore sufficient for the Cartesian null-space and cross-
    # product diagnostics performed by this database-only solver.
    diagnostic_c_over_a = 1.0 if structure.requires_c_over_a else None
    geometry = CrystalGeometry(structure.crystal_system, diagnostic_c_over_a)
    invisible_cart = [tuple(geometry.plane_to_cartesian(g)) for g in invisible_g]

    null_space_basis: List[List[float]] = []
    cross_product_vec: Vec3 | None = None

    if invisible_cart:
        a = [list(g) for g in invisible_cart]
        null_space_basis = matrix_math.null_space(a)
        rref_a = matrix_math.rref(a)
        rank = sum(1 for row in rref_a if any(abs(v) > _EPS for v in row))

        derivation.append("\n### 2. Matrix Representation & Null Space Analysis\n")
        derivation.append(f"Constraint matrix A (rank {rank}) built from the invisible g-vectors.")
        if rank == 3:
            derivation.append("Rank is 3 -- the null space contains only the trivial solution b = [0,0,0].")
        else:
            derivation.append(f"Null-space dimension = 3 - {rank} = {3 - rank} free parameter(s).")
            for i, basis_vec in enumerate(null_space_basis, start=1):
                normalized = vector_math.normalize(basis_vec)
                derivation.append(
                    f"  Basis vector {i}: {_fmt(basis_vec)} -> normalized {_fmt(normalized)}"
                )

    if len(invisible_cart) == 2:
        g1, g2 = invisible_cart[0], invisible_cart[1]
        cross_product_vec = vector_math.cross(g1, g2)
        derivation.append("\n### 3. Cross Product Method\n")
        derivation.append(
            f"Exactly two invisible g-vectors were provided (g1={_fmt(g1)}, g2={_fmt(g2)}); "
            "the predicted Burgers-vector direction lies along b = g1 x g2."
        )
        if vector_math.length(cross_product_vec) > 0:
            derivation.append(f"  b = {_fmt(cross_product_vec)} -> normalized {_fmt(vector_math.normalize(cross_product_vec))}")
        else:
            derivation.append("  Warning: the cross product is zero -- g1 and g2 are collinear.")

    candidates: List[BurgersCandidate] = []
    for label, b_vector in zip(structure.b_vector_labels, structure.b_vectors):
        b_cart = tuple(geometry.direction_to_cartesian(b_vector))
        matched_count = 0
        for g in invisible_g:
            if abs(vector_math.dot(g, b_vector)) < _EPS:
                matched_count += 1
        for g in visible_g:
            if abs(vector_math.dot(g, b_vector)) > _EPS:
                matched_count += 1

        confidence = (matched_count / total_constraints) * 100 if total_constraints else 0.0

        methods = ["Dataset Match"]
        status = "Unverified"

        if confidence == 100:
            verified_by_null_space = False
            verified_by_cross_product = False

            if len(null_space_basis) == 1:
                verified_by_null_space = vector_math.are_parallel(b_cart, tuple(null_space_basis[0]))
            elif len(null_space_basis) == 2:
                # A 2D null space means every candidate already passing the
                # 100%-confidence invisible-constraint check lies in it by
                # construction -- same logic (and same comment) as the
                # original JS.
                verified_by_null_space = True

            if cross_product_vec is not None and vector_math.length(cross_product_vec) > 0:
                verified_by_cross_product = vector_math.are_parallel(b_cart, cross_product_vec)

            if verified_by_null_space:
                methods.append("Null Space")
            if verified_by_cross_product:
                methods.append("Cross Product")
            if verified_by_null_space or verified_by_cross_product:
                status = "Verified"

        candidates.append(
            BurgersCandidate(
                label=format_burgers_vector_label(label, structure.material_id),
                b_vector=b_vector,
                confidence=confidence,
                matched_count=matched_count,
                total_count=total_constraints,
                methods=methods,
                status=status,
            )
        )

    candidates.sort(key=lambda c: c.confidence, reverse=True)

    derivation.append("\n### 4. Verification & Agreement Analysis\n")
    best = candidates[0] if candidates else None
    if best and best.confidence == 100:
        derivation.append(f"Best matching candidate: {best.label} (100% confidence).")
        if best.status == "Verified":
            derivation.append("Null-space / cross-product cross-check agrees with this candidate.")
        else:
            derivation.append(
                "Candidate satisfies all experimental constraints but is not yet "
                "mathematically unique (more independent diffraction conditions needed)."
            )
    else:
        derivation.append(
            "No candidate from this material's Burgers-vector family satisfies all "
            "recorded observations with 100% confidence."
        )

    return SolveResult(
        candidates=candidates,
        math_derivation="\n".join(derivation),
        null_space_basis=[tuple(v) for v in null_space_basis],
    )


def fully_consistent_candidates(result: SolveResult) -> List[BurgersCandidate]:
    """The subset of candidates consistent with *every* recorded observation
    (confidence == 100) -- this is the set Stage 7 actually resolves from:
    exactly one -> auto-resolved; more than one -> user must pick; zero ->
    crystallographic consistency error (see STAGE 7 REDESIGN / AUTOMATIC
    BURGERS-VECTOR DETERMINATION in the integration spec)."""
    return [c for c in result.candidates if c.confidence == 100]


def format_burgers_vector_label(raw_label: str, material_id: str) -> str:
    """Direct port of BurgersSolver.formatBurgersVectorForDisplay."""
    s = raw_label.strip()
    s = s.strip("[](){}")
    key = (material_id or "").lower()
    if any(tag in key for tag in ("fcc", "fct", "bcc", "b2")):
        return f"\u00bd[{s}]"
    if "hcp" in key or "hexagonal" in key:
        if "." in s:
            parts = s.split(".")
            return f"\u2153[{parts[0]}.{parts[1]}]"
        return f"[{s}]"
    return f"[{s}]"


def _format_equation(g: IndexVector, idx: int, is_visible: bool) -> str:
    component_names = ("b1", "b2", "b3", "b4")
    parts = []
    for component, name in zip(g, component_names):
        if component == 0:
            continue
        sign = "+" if component > 0 and parts else ""
        parts.append(f"{sign}{component:g}{name}")
    expr = "".join(parts)
    if expr.startswith("+"):
        expr = expr[1:]
    if expr == "":
        expr = "0"
    condition = "!= 0" if is_visible else "= 0"
    kind = "vis" if is_visible else "inv"
    return f"Equation {idx} (g_{kind},{idx} = {_fmt(g)}): g . b = 0 => {expr} {condition}"


def _fmt(v: Sequence[float]) -> str:
    return "[" + " ".join(f"{x:g}" for x in v) + "]"
