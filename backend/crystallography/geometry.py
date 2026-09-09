"""Crystal-system-aware Miller-index and Cartesian-coordinate conversions.

All vector algebra in the trace-analysis pipeline is performed on ordinary
three-component Cartesian vectors.  Miller and Miller--Bravais indices are
converted only at the input and output boundaries.

Supported systems
-----------------
* cubic:      directions [u v w], planes (h k l), with a = b = c
* tetragonal: directions [u v w], planes (h k l), with a = b and user c/a
* hcp:        directions [u v t w], planes (h k i l), with user c/a

For HCP, the redundant indices must satisfy t = -(u + v) for directions and
i = -(h + k) for planes.  The internal independent three-index basis uses
a1 = (1, 0, 0), a2 = (-1/2, sqrt(3)/2, 0), c = (0, 0, c/a).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache, reduce as _fred
from math import acos, degrees, gcd, sqrt
from typing import Optional, Sequence, Tuple

import numpy as np


SUPPORTED_CRYSTAL_SYSTEMS = ("cubic", "tetragonal", "hcp")

# Only the non-cubic plane-index conversion uses this bound. It is an
# numerical indexing bound: every primitive crystallographic plane inside
# the bound is considered, without assumptions about physical activity.
NON_CUBIC_PLANE_INDEX_BOUND = 12
NON_CUBIC_DIRECTION_INDEX_BOUND = 12


def crystal_structure_key_for_material(material_id: str) -> str:
    """Return canonical structure key (FCC, BCC, B2, SC, ST, BCT, FCT, HCP) for a material/system."""
    key = (material_id or "").upper()
    if "HCP" in key or "HEXAGONAL" in key:
        return "HCP"
    if "FCT" in key:
        return "FCT"
    if "BCT" in key:
        return "BCT"
    if "ST" in key or "SIMPLE_TETRAGONAL" in key or "TETRAGONAL" in key:
        return "ST"
    if "B2" in key:
        return "B2"
    if "BCC" in key:
        return "BCC"
    if "SC" in key:
        return "SC"
    if "FCC" in key or "CUBIC" in key:
        return "FCC"
    return "FCC"


def crystal_system_for_material(material_id: str) -> str:
    """Return the implemented geometry family for a supported material id."""
    key = (material_id or "").lower()
    if "hcp" in key or "hexagonal_close_packed" in key:
        return "hcp"
    if "tetragonal" in key or "st" in key or "bct" in key or "fct" in key:
        return "tetragonal"
    if any(tag in key for tag in ("cubic", "bcc", "fcc", "b2", "sc")):
        return "cubic"
    raise ValueError(
        f"Material '{material_id}' does not belong to an implemented crystal system. "
        "Supported systems are cubic, tetragonal, and HCP."
    )


def index_notation_for_system(crystal_system: str) -> str:
    return "hkil" if crystal_system.lower() == "hcp" else "hkl"


def requires_c_over_a(crystal_system: str) -> bool:
    return crystal_system.lower() in ("tetragonal", "hcp")


def _reduce_components(values: Sequence[float]) -> Optional[Tuple[int, ...]]:
    """Reduce a float vector to a small integer ratio.

    This deliberately mirrors the existing pipeline's reduction strategy so
    cubic results remain familiar while allowing either three or four output
    components.
    """
    v = np.asarray(values, dtype=float)
    if v.ndim != 1 or np.linalg.norm(v) < 1e-10:
        return None

    def _gcd_reduce(ints: np.ndarray) -> Optional[Tuple[int, ...]]:
        nz = [abs(int(x)) for x in ints if int(x) != 0]
        if not nz:
            return None
        divisor = _fred(gcd, nz)
        result = tuple(int(x) // divisor for x in ints)
        return result if any(result) else None

    rounded = np.round(v).astype(int)
    if np.allclose(v, rounded, atol=1e-6):
        result = _gcd_reduce(rounded)
        if result is not None:
            return result

    for multiplier in range(1, 49):
        scaled = v * multiplier
        rounded = np.round(scaled).astype(int)
        if np.allclose(scaled, rounded, atol=1e-6):
            result = _gcd_reduce(rounded)
            if result is not None:
                return result

    nonzero = np.abs(v) > 1e-10
    if np.any(nonzero):
        scaled = v / np.min(np.abs(v[nonzero]))
        rounded = np.round(scaled).astype(int)
        if np.allclose(scaled, rounded, atol=1e-4):
            result = _gcd_reduce(rounded)
            if result is not None:
                return result

    return _gcd_reduce(np.round(v).astype(int))


def acute_cartesian_deviation_deg(
    vector: Sequence[float],
    indexed_vector: Sequence[float],
) -> float:
    """Return the unoriented Cartesian angular deviation in degrees.

    Plane normals and dislocation lines are both sign-ambiguous, so the
    absolute dot product is used and the result is restricted to 0--90 deg.
    """
    a = np.asarray(vector, dtype=float)
    b = np.asarray(indexed_vector, dtype=float)
    a_norm = float(np.linalg.norm(a))
    b_norm = float(np.linalg.norm(b))
    if a_norm < 1e-12 or b_norm < 1e-12:
        raise ValueError("Angular deviation is undefined for a zero vector.")
    cosine = abs(float(np.dot(a / a_norm, b / b_norm)))
    return degrees(acos(max(0.0, min(1.0, cosine))))


@lru_cache(maxsize=None)
def _primitive_direction_triplets(
    crystal_system: str,
    max_index: int,
) -> Tuple[Tuple[int, int, int], ...]:
    """Generate primitive, sign-unique direction triplets within a finite bound."""
    candidates = []
    for u in range(-max_index, max_index + 1):
        for v in range(-max_index, max_index + 1):
            for w in range(-max_index, max_index + 1):
                if u == 0 and v == 0 and w == 0:
                    continue
                nz = [abs(x) for x in (u, v, w) if x != 0]
                if _fred(gcd, nz) != 1:
                    continue
                first = next(x for x in (u, v, w) if x != 0)
                if first < 0:
                    continue
                candidates.append((u, v, w))
    return tuple(candidates)


@lru_cache(maxsize=None)
def _primitive_plane_triplets(
    crystal_system: str,
    max_index: int,
) -> Tuple[Tuple[int, int, int], ...]:
    """Generate primitive, sign-unique plane indices within a finite bound."""
    candidates = []
    for h in range(-max_index, max_index + 1):
        for k in range(-max_index, max_index + 1):
            # In Miller--Bravais notation i = -(h+k); bound it as well.
            if crystal_system == "hcp" and abs(h + k) > max_index:
                continue
            for l in range(-max_index, max_index + 1):
                if h == 0 and k == 0 and l == 0:
                    continue
                nz = [abs(x) for x in (h, k, l) if x]
                if _fred(gcd, nz) != 1:
                    continue
                first = next(x for x in (h, k, l) if x)
                if first < 0:
                    continue
                candidates.append((h, k, l))
    return tuple(candidates)


def reduce_integer_indices(values: Sequence[int]) -> Tuple[int, ...]:
    """GCD-reduce an integer index tuple without changing its direction."""
    ints = tuple(int(x) for x in values)
    nz = [abs(x) for x in ints if x != 0]
    if not nz:
        return ints
    divisor = _fred(gcd, nz)
    return tuple(x // divisor for x in ints)


def hcp_direction_three_to_four(indices: Sequence[int]) -> Tuple[int, int, int, int]:
    """Convert independent HCP [U V W] to reduced Miller--Bravais [u v t w]."""
    if len(indices) != 3:
        raise ValueError("HCP three-index direction must contain exactly [U V W].")
    U, V, W = (int(x) for x in indices)
    raw = (2 * U - V, 2 * V - U, -(U + V), 3 * W)
    return reduce_integer_indices(raw)  # type: ignore[return-value]


def hcp_direction_four_to_three(indices: Sequence[float]) -> np.ndarray:
    """Convert HCP Miller--Bravais [u v t w] to independent [U V W]."""
    if len(indices) != 4:
        raise ValueError("HCP direction must contain four indices [u v t w].")
    u, v, t, w = (float(x) for x in indices)
    if not np.isclose(t, -(u + v), atol=1e-8):
        raise ValueError(
            f"Invalid HCP direction [{u:g} {v:g} {t:g} {w:g}]: "
            "the redundant index must satisfy t = -(u + v)."
        )
    return np.array([2.0 * u + v, u + 2.0 * v, w], dtype=float)


def hcp_plane_three_to_four(indices: Sequence[int]) -> Tuple[int, int, int, int]:
    """Convert independent HCP plane (h k l) to (h k i l)."""
    if len(indices) != 3:
        raise ValueError("HCP three-index plane must contain exactly (h k l).")
    h, k, l = (int(x) for x in indices)
    return reduce_integer_indices((h, k, -(h + k), l))  # type: ignore[return-value]


def hcp_plane_four_to_three(indices: Sequence[float]) -> np.ndarray:
    """Convert HCP Miller--Bravais plane (h k i l) to independent (h k l)."""
    if len(indices) != 4:
        raise ValueError("HCP plane must contain four indices (h k i l).")
    h, k, i, l = (float(x) for x in indices)
    if not np.isclose(i, -(h + k), atol=1e-8):
        raise ValueError(
            f"Invalid HCP plane ({h:g} {k:g} {i:g} {l:g}): "
            "the redundant index must satisfy i = -(h + k)."
        )
    return np.array([h, k, l], dtype=float)


@dataclass(frozen=True)
class CrystalGeometry:
    """Coordinate conversion service for one selected crystal system."""

    crystal_system: str = "cubic"
    c_over_a: Optional[float] = None

    def __post_init__(self) -> None:
        system = self.crystal_system.lower()
        if system not in SUPPORTED_CRYSTAL_SYSTEMS:
            raise ValueError(
                f"Unsupported crystal system '{self.crystal_system}'. "
                f"Choose one of {', '.join(SUPPORTED_CRYSTAL_SYSTEMS)}."
            )
        object.__setattr__(self, "crystal_system", system)

        if requires_c_over_a(system):
            if self.c_over_a is None or not np.isfinite(self.c_over_a) or self.c_over_a <= 0:
                raise ValueError(f"A finite positive c/a ratio is required for {system} calculations.")
            object.__setattr__(self, "c_over_a", float(self.c_over_a))
        elif self.c_over_a is not None:
            object.__setattr__(self, "c_over_a", float(self.c_over_a))

    @property
    def index_count(self) -> int:
        return 4 if self.crystal_system == "hcp" else 3

    @property
    def index_notation(self) -> str:
        return index_notation_for_system(self.crystal_system)

    @property
    def direct_basis(self) -> np.ndarray:
        if self.crystal_system == "cubic":
            return np.eye(3, dtype=float)
        if self.crystal_system == "tetragonal":
            return np.diag([1.0, 1.0, float(self.c_over_a)])
        return np.array(
            [
                [1.0, -0.5, 0.0],
                [0.0, sqrt(3.0) / 2.0, 0.0],
                [0.0, 0.0, float(self.c_over_a)],
            ],
            dtype=float,
        )

    @property
    def reciprocal_basis(self) -> np.ndarray:
        return np.linalg.inv(self.direct_basis).T

    def direction_to_cartesian(self, indices: Sequence[float]) -> np.ndarray:
        if self.crystal_system == "hcp":
            independent = hcp_direction_four_to_three(indices)
        else:
            if len(indices) != 3:
                raise ValueError(
                    f"{self.crystal_system.title()} direction must contain exactly three indices [u v w]."
                )
            independent = np.asarray(indices, dtype=float)
        if np.linalg.norm(independent) < 1e-12:
            raise ValueError("A crystallographic direction cannot be the zero vector.")
        return self.direct_basis @ independent

    def plane_to_cartesian(self, indices: Sequence[float]) -> np.ndarray:
        if self.crystal_system == "hcp":
            independent = hcp_plane_four_to_three(indices)
        else:
            if len(indices) != 3:
                raise ValueError(
                    f"{self.crystal_system.title()} plane must contain exactly three indices (h k l)."
                )
            independent = np.asarray(indices, dtype=float)
        if np.linalg.norm(independent) < 1e-12:
            raise ValueError("A crystallographic plane cannot have all-zero Miller indices.")
        return self.reciprocal_basis @ independent

        return three

    def index_true_line_direction(self, vector: Sequence[float]) -> Optional[Tuple[int, ...]]:
        """Index a continuous vector as a crystallographic true line direction."""
        cart = np.asarray(vector, dtype=float)
        if cart.shape != (3,):
            raise ValueError("Cartesian directions must contain exactly three components.")
        if np.linalg.norm(cart) < 1e-10:
            return None

        if self.crystal_system == "cubic":
            independent = np.linalg.solve(self.direct_basis, cart)
            three = _reduce_components(independent)
        else:
            target = cart / np.linalg.norm(cart)
            best_indices: Optional[Tuple[int, int, int]] = None
            best_error = float("inf")
            best_complexity: Optional[Tuple[int, int]] = None

            for indices in _primitive_direction_triplets(
                self.crystal_system,
                NON_CUBIC_DIRECTION_INDEX_BOUND,
            ):
                indexed_cart = self.direct_basis @ np.asarray(indices, dtype=float)
                error = acute_cartesian_deviation_deg(target, indexed_cart)
                if self.crystal_system == "hcp":
                    four = hcp_direction_three_to_four(indices)
                    complexity = (max(abs(x) for x in four), sum(abs(x) for x in four))
                else:
                    complexity = (max(abs(x) for x in indices), sum(abs(x) for x in indices))

                if (
                    error < best_error - 1e-12
                    or (
                        abs(error - best_error) <= 1e-12
                        and (best_complexity is None or complexity < best_complexity)
                    )
                ):
                    best_indices = indices
                    best_error = error
                    best_complexity = complexity

            if best_indices is None:
                return None

            best_cart = self.direct_basis @ np.asarray(best_indices, dtype=float)
            if float(np.dot(best_cart, target)) < 0.0:
                best_indices = tuple(-x for x in best_indices)
            three = best_indices

        if three is None:
            return None
        if self.crystal_system == "hcp":
            return hcp_direction_three_to_four(three)
        return three

    def indexTrueLineDirection(self, vector: Sequence[float]) -> Optional[Tuple[int, ...]]:
        return self.index_true_line_direction(vector)

    def cartesian_to_direction(self, vector: Sequence[float]) -> Optional[Tuple[int, ...]]:
        return self.index_true_line_direction(vector)

    def index_continuous_slip_plane(self, normal: Sequence[float]) -> Optional[Tuple[int, ...]]:
        """Index a continuous slip-plane normal into integer Miller / Miller-Bravais indices."""
        cart = np.asarray(normal, dtype=float)
        if cart.shape != (3,):
            raise ValueError("Cartesian plane normals must contain exactly three components.")
        if np.linalg.norm(cart) < 1e-10:
            return None

        if self.crystal_system == "cubic":
            independent = self.direct_basis.T @ cart
            three = _reduce_components(independent)
        else:
            target = cart / np.linalg.norm(cart)
            best_indices: Optional[Tuple[int, int, int]] = None
            best_error = float("inf")
            best_complexity: Optional[Tuple[int, int]] = None

            for indices in _primitive_plane_triplets(
                self.crystal_system,
                NON_CUBIC_PLANE_INDEX_BOUND,
            ):
                indexed_cart = self.reciprocal_basis @ np.asarray(indices, dtype=float)
                error = acute_cartesian_deviation_deg(target, indexed_cart)
                complexity = (max(abs(x) for x in indices), sum(abs(x) for x in indices))
                if (
                    error < best_error - 1e-12
                    or (
                        abs(error - best_error) <= 1e-12
                        and (best_complexity is None or complexity < best_complexity)
                    )
                ):
                    best_indices = indices
                    best_error = error
                    best_complexity = complexity

            if best_indices is None:
                return None

            best_cart = self.reciprocal_basis @ np.asarray(best_indices, dtype=float)
            if float(np.dot(best_cart, target)) < 0.0:
                best_indices = tuple(-x for x in best_indices)
            three = best_indices

        if three is None:
            return None
        if self.crystal_system == "hcp":
            return hcp_plane_three_to_four(three)
        return three

    def indexContinuousSlipPlane(self, normal: Sequence[float]) -> Optional[Tuple[int, ...]]:
        return self.index_continuous_slip_plane(normal)

    def cartesian_to_plane(self, normal: Sequence[float]) -> Optional[Tuple[int, ...]]:
        return self.index_continuous_slip_plane(normal)

    def plane_indexing_deviation_deg(
        self,
        normal: Sequence[float],
        indices: Sequence[float],
    ) -> float:
        """Measure how closely reported plane indices represent a normal."""
        return acute_cartesian_deviation_deg(normal, self.plane_to_cartesian(indices))

    def direction_indexing_deviation_deg(
        self,
        direction: Sequence[float],
        indices: Sequence[float],
    ) -> float:
        """Measure how closely reported direction indices represent a vector."""
        return acute_cartesian_deviation_deg(direction, self.direction_to_cartesian(indices))


def geometry_for_material(material_id: str, c_over_a: Optional[float] = None) -> CrystalGeometry:
    return CrystalGeometry(crystal_system_for_material(material_id), c_over_a)


def index_true_line_direction(
    vector: Sequence[float],
    crystal_system: str = "cubic",
    c_over_a: Optional[float] = None,
) -> Optional[Tuple[int, ...]]:
    """Index a continuous vector as a true line direction for the given system/geometry."""
    return CrystalGeometry(crystal_system, c_over_a).index_true_line_direction(vector)


indexTrueLineDirection = index_true_line_direction


def index_continuous_slip_plane(
    normal: Sequence[float],
    crystal_system: str = "cubic",
    c_over_a: Optional[float] = None,
) -> Optional[Tuple[int, ...]]:
    """Index a continuous slip plane normal into integer indices for the given system/geometry."""
    return CrystalGeometry(crystal_system, c_over_a).index_continuous_slip_plane(normal)


indexContinuousSlipPlane = index_continuous_slip_plane

