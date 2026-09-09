"""
modules/classifier.py
======================
Stage 8 — dislocation character and slip plane.

Character criterion  (angle α between U and b̂)
-----------------------------------------------
    0°      →  Screw
    1°–45°  →  Mixed-Screw-Dominant
    46°–89° →  Mixed-Edge-Dominant
    90°     →  Edge

Slip plane
----------
The Burgers vector b and the true line U both lie in the slip plane.
Its outward normal is:

    n_slip = b × U     (then GCD-reduced to Miller indices)

Public API
----------
classify(U_norm, burgers)               → ClassifyResult
classify_character(U_norm, burgers)     → (angle_deg, character_str)
compute_slip_plane(U_norm, burgers)     → (slip_raw, slip_miller)
format_classify(cr)                     → str
"""

from __future__ import annotations

import math
from typing import Tuple

import numpy as np

from .pipeline_types import ClassifyResult, TrueLineResult
from .true_line_solver import reduce_miller
from crystallography.geometry import CrystalGeometry, crystal_structure_key_for_material
from crystallography.plane_catalogue import find_closest_low_index_slip_plane


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC
# ══════════════════════════════════════════════════════════════════════════════

def classify(
    true_line: TrueLineResult,
    burgers:   np.ndarray,
    material_id: Optional[str] = None,
    structure_key: Optional[str] = None,
) -> ClassifyResult:
    """
    Full classification for one pair.

    Parameters
    ----------
    true_line : TrueLineResult from Stage 7.
    burgers   : Burgers vector b as a numpy array.

    Returns
    -------
    ClassifyResult with character, U–b angle, integer slip plane, and closest low-index slip plane.
    """
    geometry = CrystalGeometry(true_line.crystal_system, true_line.c_over_a)
    if true_line.crystal_system == "cubic":
        # The legacy cubic workflow already represents indices and Cartesian
        # components in the same orthonormal basis.
        burgers_cart = np.asarray(burgers, dtype=float)
    else:
        burgers_cart = geometry.direction_to_cartesian(burgers)

    angle_deg, character = classify_character(true_line.U_norm, burgers_cart)
    slip_raw, slip_miller = compute_slip_plane(
        true_line.U_norm,
        burgers_cart,
        geometry=geometry,
    )

    resolved_struct_key = structure_key or crystal_structure_key_for_material(material_id or true_line.crystal_system)
    is_screw = (character == "Screw") or (np.linalg.norm(slip_raw) < 1e-8)

    low_index_res = find_closest_low_index_slip_plane(
        structure_key=resolved_struct_key,
        n_continuous=slip_raw,
        burgers=burgers,
        geometry=geometry,
        is_pure_screw=is_screw,
    )

    return ClassifyResult(
        pair_id=true_line.pair_id,
        burgers=burgers.copy(),
        ub_angle_deg=angle_deg,
        character=character,
        slip_raw=slip_raw,
        slip_miller=slip_miller if not is_screw else None,
        crystal_system=true_line.crystal_system,
        c_over_a=true_line.c_over_a,
        closest_low_index_plane=low_index_res.closest_plane,
        closest_low_index_plane_str=low_index_res.closest_plane_str,
        low_index_family=low_index_res.family,
        low_index_deviation_deg=low_index_res.deviation_deg,
        low_index_slip_system=low_index_res.slip_system,
        structure_key=resolved_struct_key,
    )


def classify_character(
    U_norm:  np.ndarray,
    burgers: np.ndarray,
) -> Tuple[float, str]:
    """
    Compute the acute angle between the dislocation line direction U and
    the Burgers vector b, then assign character:
      0°      → Screw
      1°–45°  → Mixed-Screw-Dominant
      46°–89° → Mixed-Edge-Dominant
      90°     → Edge

    Parameters
    ----------
    U_norm  : normalised true dislocation line direction (unit vector).
    burgers : Burgers vector b  (need not be normalised).

    Returns
    -------
    (angle_deg, character)
        angle_deg — acute angle between U and b̂  in [0°, 90°].
        character — "Screw", "Mixed-Screw-Dominant", "Mixed-Edge-Dominant", or "Edge".
    """
    b_hat = _normalise(burgers)
    U_hat = _normalise(U_norm)
    cos_v = abs(float(np.dot(U_hat, b_hat)))
    cos_v = max(0.0, min(1.0, cos_v))             # clamp numerical noise
    angle_deg = math.degrees(math.acos(cos_v))    # acute, so cos_v → |cos|

    if angle_deg < 0.5:
        character = "Screw"
    elif angle_deg <= 45.0:
        character = "Mixed-Screw-Dominant"
    elif angle_deg < 89.5:
        character = "Mixed-Edge-Dominant"
    else:
        character = "Edge"

    return round(angle_deg, 2), character


def compute_slip_plane(
    U_norm:  np.ndarray,
    burgers: np.ndarray,
    geometry: CrystalGeometry | None = None,
) -> Tuple[np.ndarray, Tuple[int, ...] | None]:
    """
    Compute the slip plane normal as  n = b̂ × Û  and reduce to Miller indices.

    Both operands are normalised before the cross product so the result
    is at unit scale, making the magnitude check meaningful regardless of
    the raw magnitude of the Burgers vector.

    Parameters
    ----------
    U_norm  : normalised true dislocation line direction.
    burgers : Burgers vector b  (need not be normalised).

    Returns
    -------
    slip_raw    — cross-product b̂ × Û  (unit-scale).
    slip_miller — GCD-reduced integer Miller indices  (h, k, l),
                  or None when b ∥ U (cross product ≈ zero, plane undefined).
    """
    _SLIP_EPS = 1e-8

    b_hat = _normalise(burgers)
    u_hat = _normalise(U_norm)
    slip_raw = np.cross(b_hat, u_hat)

    mag = np.linalg.norm(slip_raw)
    if mag < _SLIP_EPS:
        # b and U are (nearly) parallel — slip plane is physically undefined.
        return slip_raw, None

    slip_norm = slip_raw / mag
    if geometry is None or geometry.crystal_system == "cubic":
        slip_miller = reduce_miller(slip_norm)
    else:
        slip_miller = geometry.index_continuous_slip_plane(slip_norm)


    # Guard: if reduce_miller returned None (could not find valid indices),
    # reject it — never allow (0,0,0) or None to slip through as valid.
    if slip_miller is None or not any(slip_miller):
        return slip_raw, None

    return slip_raw, slip_miller


# ══════════════════════════════════════════════════════════════════════════════
# FORMATTING
# ══════════════════════════════════════════════════════════════════════════════

def format_classify(cr: ClassifyResult) -> str:
    """Return a multi-line console summary for one ClassifyResult."""
    icon = {
        "Screw": "↺",
        "Mixed-Screw-Dominant": "↺↗",
        "Mixed-Edge-Dominant": "⊥↗",
        "Edge": "⊥",
        "SCREW": "↺",
        "MIXED-SCREW-DOMINANT": "↺↗",
        "MIXED-EDGE-DOMINANT": "⊥↗",
        "EDGE": "⊥",
        "SCREW DOMINANT": "↺",
        "EDGE DOMINANT": "⊥",
        "MIXED": "↗",
    }.get(cr.character, "?")
    slip_display = cr.slip_miller if cr.slip_miller is not None else "Undefined (b ∥ U)"
    lines = [
        f"  Pair {cr.pair_id}  —  Classification",
        f"  {'─' * 60}",
        f"  Burgers vector b           =  {cr.burgers.astype(int).tolist()}",
        f"  U–b angle                  =  {cr.ub_angle_deg:.2f}°",
        f"  Character                  =  {icon}  {cr.character}",
        f"  Slip plane normal (b×U)    =  [{' '.join(f'{x:+.2f}' for x in cr.slip_raw)}]",
        f"  Slip plane (GCD-reduced)   =  {slip_display}",
    ]
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# PRIVATE
# ══════════════════════════════════════════════════════════════════════════════

def _normalise(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v.copy()
