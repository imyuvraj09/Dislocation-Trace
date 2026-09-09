"""
crystallography/plane_catalogue.py
===================================
Centralized, editable crystal-structure low-index plane-family database
and candidate selection engine for TEM dislocation trace analysis.

Supported crystal structures:
- FCC, BCC, B2, SC (cubic)
- ST, BCT, FCT (tetragonal)
- HCP (hexagonal)

Note: These are configurable low-index candidate families. Identifying
the nearest geometrical plane having the smallest acute Cartesian angular
deviation from the continuous slip-plane normal does not, by itself, prove
that the plane was physically active.
"""

from __future__ import annotations

import itertools
import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple, Union

import numpy as np


# ══════════════════════════════════════════════════════════════════════════════
# CENTRALIZED PLANE-FAMILY DATABASE
# ══════════════════════════════════════════════════════════════════════════════

LOW_INDEX_PLANE_FAMILIES: Dict[str, List[Dict[str, Union[str, List[int]]]]] = {
    "FCC": [
        {"family": "{111}", "representative": [1, 1, 1], "name": "Octahedral"},
        {"family": "{100}", "representative": [1, 0, 0], "name": "Cube"},
        {"family": "{110}", "representative": [1, 1, 0], "name": "Low-index candidate"},
    ],

    "BCC": [
        {"family": "{110}", "representative": [1, 1, 0], "name": "Primary BCC"},
        {"family": "{112}", "representative": [1, 1, 2], "name": "BCC candidate"},
        {"family": "{123}", "representative": [1, 2, 3], "name": "BCC candidate"},
    ],

    "B2": [
        {"family": "{100}", "representative": [1, 0, 0], "name": "B2 candidate"},
        {"family": "{110}", "representative": [1, 1, 0], "name": "B2 candidate"},
        {"family": "{112}", "representative": [1, 1, 2], "name": "B2 candidate"},
        {"family": "{123}", "representative": [1, 2, 3], "name": "B2 candidate"},
    ],

    "SC": [
        {"family": "{100}", "representative": [1, 0, 0], "name": "Simple-cubic candidate"},
        {"family": "{110}", "representative": [1, 1, 0], "name": "Simple-cubic candidate"},
        {"family": "{111}", "representative": [1, 1, 1], "name": "Simple-cubic candidate"},
    ],

    "ST": [
        {"family": "{001}", "representative": [0, 0, 1], "name": "Basal candidate"},
        {"family": "{100}", "representative": [1, 0, 0], "name": "Prismatic candidate"},
        {"family": "{110}", "representative": [1, 1, 0], "name": "Tetragonal candidate"},
        {"family": "{101}", "representative": [1, 0, 1], "name": "Tetragonal candidate"},
        {"family": "{111}", "representative": [1, 1, 1], "name": "Tetragonal candidate"},
        {"family": "{112}", "representative": [1, 1, 2], "name": "Tetragonal candidate"},
    ],

    "BCT": [
        {"family": "{001}", "representative": [0, 0, 1], "name": "Basal candidate"},
        {"family": "{100}", "representative": [1, 0, 0], "name": "BCT candidate"},
        {"family": "{101}", "representative": [1, 0, 1], "name": "BCT candidate"},
        {"family": "{110}", "representative": [1, 1, 0], "name": "BCT candidate"},
        {"family": "{112}", "representative": [1, 1, 2], "name": "BCT candidate"},
        {"family": "{123}", "representative": [1, 2, 3], "name": "BCT candidate"},
    ],

    "FCT": [
        {"family": "{001}", "representative": [0, 0, 1], "name": "Basal candidate"},
        {"family": "{100}", "representative": [1, 0, 0], "name": "FCT candidate"},
        {"family": "{101}", "representative": [1, 0, 1], "name": "FCT candidate"},
        {"family": "{110}", "representative": [1, 1, 0], "name": "FCT candidate"},
        {"family": "{111}", "representative": [1, 1, 1], "name": "FCT candidate"},
    ],

    "HCP": [
        {"family": "{0001}", "representative": [0, 0, 0, 1], "name": "Basal"},
        {"family": "{10-10}", "representative": [1, 0, -1, 0], "name": "First-order prismatic"},
        {"family": "{11-20}", "representative": [1, 1, -2, 0], "name": "Second-order prismatic"},
        {"family": "{10-11}", "representative": [1, 0, -1, 1], "name": "First-order pyramidal"},
        {"family": "{11-21}", "representative": [1, 1, -2, 1], "name": "Low-index pyramidal candidate"},
        {"family": "{11-22}", "representative": [1, 1, -2, 2], "name": "Second-order pyramidal"},
    ],
}


# ══════════════════════════════════════════════════════════════════════════════
# SYMMETRY-EQUIVALENT PLANE GENERATION
# ══════════════════════════════════════════════════════════════════════════════

def generate_symmetry_variants(
    structure_key: str,
    representative: Sequence[int],
) -> List[Tuple[int, ...]]:
    """
    Generate all crystallographically equivalent plane variants for a family representative.

    - Cubic (FCC, BCC, B2, SC): full index permutations and sign combinations.
    - Tetragonal (ST, BCT, FCT): permutations and sign combinations of (h, k),
      preserving l along the tetragonal z-axis.
    - HCP: 12 hexagonal symmetry operations on (h, k, i) with i = -(h+k), combined with +-l.
    """
    struct = structure_key.upper()
    rep = tuple(int(x) for x in representative)

    if struct in ("FCC", "BCC", "B2", "SC"):
        h, k, l = rep
        abs_tuple = (abs(h), abs(k), abs(l))
        variants = set()
        for perm in set(itertools.permutations(abs_tuple)):
            for signs in itertools.product((1, -1), repeat=3):
                var = (signs[0] * perm[0], signs[1] * perm[1], signs[2] * perm[2])
                if any(var):
                    variants.add(var)
        return sorted(list(variants))

    if struct in ("ST", "BCT", "FCT"):
        h, k, l = rep
        abs_hk = (abs(h), abs(k))
        variants = set()
        for perm in set(itertools.permutations(abs_hk)):
            for signs in itertools.product((1, -1), repeat=2):
                h_val = signs[0] * perm[0]
                k_val = signs[1] * perm[1]
                for sign_l in (1, -1):
                    l_val = sign_l * abs(l) if l != 0 else 0
                    var = (h_val, k_val, l_val)
                    if any(var):
                        variants.add(var)
        return sorted(list(variants))

    if struct == "HCP":
        h, k, i, l = rep
        abs_l = abs(l)
        l_signs = (abs_l, -abs_l) if abs_l != 0 else (0,)

        # Permutations of the {h, k, i} triplet
        hk_triplet = (h, k, i)
        variants = set()

        for perm in set(itertools.permutations(hk_triplet)):
            # perm is (h_p, k_p, i_p)
            for factor in (1, -1):
                h_var = factor * perm[0]
                k_var = factor * perm[1]
                i_var = factor * perm[2]
                if i_var == -(h_var + k_var):
                    for l_var in l_signs:
                        if any((h_var, k_var, i_var, l_var)):
                            variants.add((h_var, k_var, i_var, l_var))

        return sorted(list(variants))

    raise ValueError(f"Unsupported crystal structure key '{structure_key}'.")


# ══════════════════════════════════════════════════════════════════════════════
# BURGERS-VECTOR COMPATIBILITY (ZONE LAW)
# ══════════════════════════════════════════════════════════════════════════════

def is_plane_compatible(
    variant: Sequence[int],
    burgers: Sequence[Union[int, float]],
) -> bool:
    """
    Apply the zone law to check if a specific plane contains the Burgers vector:
    - 3-index: h*u + k*v + l*w = 0
    - 4-index HCP: h*u + k*v + i*t + l*w = 0
    """
    if len(variant) == 3 and len(burgers) == 3:
        dot_val = sum(int(h) * float(b) for h, b in zip(variant, burgers))
        return abs(dot_val) < 1e-6
    if len(variant) == 4 and len(burgers) == 4:
        dot_val = sum(int(h) * float(b) for h, b in zip(variant, burgers))
        return abs(dot_val) < 1e-6
    return False


# ══════════════════════════════════════════════════════════════════════════════
# SELECTION RESULT DATACLASS & ALGORITHM
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class LowIndexPlaneResult:
    closest_plane: Optional[Tuple[int, ...]]
    closest_plane_str: str
    family: str
    family_name: str
    deviation_deg: Optional[float]
    slip_system: str
    status: str  # "OK", "PURE_SCREW", "NO_COMPATIBLE_PLANE"


def find_closest_low_index_plane(
    structure_key: str,
    n_continuous: np.ndarray,
    burgers: np.ndarray,
    geometry,
    is_pure_screw: bool = False,
) -> LowIndexPlaneResult:
    """
    Find the closest Burgers-vector-compatible low-index slip plane variant
    for the specified crystal structure.
    """
    if is_pure_screw or np.linalg.norm(n_continuous) < 1e-10:
        return LowIndexPlaneResult(
            closest_plane=None,
            closest_plane_str="Not uniquely determined",
            family="N/A",
            family_name="N/A",
            deviation_deg=None,
            slip_system="Plane not uniquely determined for screw dislocation",
            status="PURE_SCREW",
        )

    struct = structure_key.upper()
    families = LOW_INDEX_PLANE_FAMILIES.get(struct)
    if not families:
        # Fallback mapping if struct is generic e.g. CUBIC or TETRAGONAL
        if struct in ("CUBIC", "FCC"):
            struct = "FCC"
        elif struct in ("TETRAGONAL", "ST"):
            struct = "ST"
        elif struct in ("HCP", "HEXAGIONAL"):
            struct = "HCP"
        families = LOW_INDEX_PLANE_FAMILIES.get(struct, LOW_INDEX_PLANE_FAMILIES["FCC"])

    n_cont_unit = n_continuous / np.linalg.norm(n_continuous)

    # Collect all compatible candidates
    candidates = []

    for fam_idx, fam_info in enumerate(families):
        fam_str = str(fam_info["family"])
        fam_name = str(fam_info["name"])
        rep = fam_info["representative"]

        variants = generate_symmetry_variants(struct, rep)

        for var in variants:
            if not is_plane_compatible(var, burgers):
                continue

            # Convert variant plane normal to Cartesian
            cart_norm = geometry.plane_to_cartesian(var)
            cart_norm_mag = np.linalg.norm(cart_norm)
            if cart_norm_mag < 1e-12:
                continue

            cart_unit = cart_norm / cart_norm_mag
            dot_prod = float(np.dot(n_cont_unit, cart_unit))
            cosine = max(0.0, min(1.0, abs(dot_prod)))
            dev_deg = math.degrees(math.acos(cosine))

            # Deterministic sign selection: choose sign whose Cartesian normal
            # has positive dot product with continuous calculated normal.
            if dot_prod < 0.0:
                selected_var = tuple(-x for x in var)
            else:
                selected_var = var

            # Tie-breaking key:
            # 1. Smaller angular deviation
            # 2. Lower-index complexity (max abs index, sum abs index)
            # 3. Database family order
            # 4. Stable lexicographic order of indices
            complexity = (max(abs(x) for x in selected_var), sum(abs(x) for x in selected_var))
            key = (round(dev_deg, 10), complexity, fam_idx, selected_var)

            candidates.append((key, dev_deg, selected_var, fam_str, fam_name))

    if not candidates:
        return LowIndexPlaneResult(
            closest_plane=None,
            closest_plane_str="No compatible catalogue plane",
            family="N/A",
            family_name="N/A",
            deviation_deg=None,
            slip_system="N/A",
            status="NO_COMPATIBLE_PLANE",
        )

    # Sort candidates according to tie-breaking rules
    candidates.sort(key=lambda c: c[0])
    best = candidates[0]
    dev_deg = best[1]
    selected_var = best[2]
    fam_str = best[3]
    fam_name = best[4]

    plane_str = "(" + " ".join(str(x) for x in selected_var) + ")"
    burgers_ints = [int(round(x)) for x in burgers]
    burgers_str = "[" + " ".join(str(x) for x in burgers_ints) + "]"
    slip_sys_str = f"{fam_str}{burgers_str}"

    return LowIndexPlaneResult(
        closest_plane=selected_var,
        closest_plane_str=plane_str,
        family=fam_str,
        family_name=fam_name,
        deviation_deg=dev_deg,
        slip_system=slip_sys_str,
        status="OK",
    )


find_closest_low_index_slip_plane = find_closest_low_index_plane
findClosestLowIndexSlipPlane = find_closest_low_index_plane

