"""
crystallography/queries.py
============================
The ONLY public entry point other backend modules (routers, session
store glue) should use to reach crystallographic reference data or the
Burgers-vector solver. Nothing outside this package touches loader.py,
solver.py, or crystallography/data/*.json directly -- see this
package's __init__.py docstring.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from . import solver as _solver
from .loader import REGISTRY, CrystallographyLoadError
from .models import BurgersCandidate, CrystalStructure, SolveResult

IndexVector = Tuple[float, ...]

__all__ = [
    "CrystallographyLoadError",
    "list_materials",
    "get_material",
    "get_crystal_structure",
    "lookup_material",
    "get_allowed_burgers_vectors",
    "get_allowed_g_vectors",
    "get_reflection_table",
    "get_gb_value",
    "get_gb_table",
    "validate_gb_observation",
    "solve_candidates",
]


def list_materials() -> List[Dict[str, object]]:
    """Every selectable material, as [{id, name}] -- backs GET /api/materials."""
    manifest = REGISTRY.manifest()
    materials: List[Dict[str, object]] = []
    for material_id, name in manifest.items():
        structure = get_material(material_id)
        materials.append(
            {
                "id": material_id,
                "name": name,
                "crystalSystem": structure.crystal_system,
                "indexNotation": structure.index_notation,
                "requiresCOverA": structure.requires_c_over_a,
            }
        )
    return materials


def get_material(material_id: str) -> CrystalStructure:
    """Full normalized dataset for one material id. Raises CrystallographyLoadError
    if the id isn't in the manifest."""
    return REGISTRY.get(material_id)


# Alias -- some callers think in terms of "crystal structure" rather than
# "material"; both names are kept per the DATABASE API section of the
# integration spec, but they are the same lookup (see the architecture
# analysis: g.b has no separate elemental/lattice-parameter table, so a
# "material" here *is* a crystal-structure family).
get_crystal_structure = get_material


def lookup_material(query: str) -> List[Dict[str, object]]:
    """Case-insensitive substring search over material id + display name."""
    q = query.strip().lower()
    if not q:
        return list_materials()
    return [m for m in list_materials() if q in m["id"].lower() or q in m["name"].lower()]


def get_allowed_burgers_vectors(material_id: str) -> List[Dict[str, object]]:
    """The material's full Burgers-vector family, as
    [{label, vector: [bx,by,bz]}, ...] -- this is the candidate pool the
    solver filters; nothing is ever added to or removed from it."""
    structure = get_material(material_id)
    return [
        {"label": label, "vector": list(vec)}
        for label, vec in zip(structure.b_vector_labels, structure.b_vectors)
    ]


def get_allowed_g_vectors(material_id: str) -> List[Tuple[int, ...]]:
    """Every reflection tabulated for this material."""
    return get_material(material_id).g_vectors


# Alias per the spec's naming (getReflectionTable).
get_reflection_table = get_allowed_g_vectors


def get_gb_value(material_id: str, g: IndexVector, b_label: str) -> Optional[int]:
    """Looks up the precomputed g.b product for a tabulated (g, b) pair,
    if both are present in this material's reference table. Returns None
    if either isn't tabulated (callers needing a live value for an
    arbitrary g -- e.g. the solver -- compute it directly instead; see
    solver.py's module docstring)."""
    structure = get_material(material_id)
    try:
        g_idx = structure.g_vectors.index(tuple(int(x) for x in g))
    except ValueError:
        return None
    try:
        b_idx = structure.b_vector_labels.index(b_label)
    except ValueError:
        return None
    return structure.values[g_idx][b_idx]


def get_gb_table(material_id: str) -> Dict[str, object]:
    """The full g.b reference table for one material, in the same
    {name, g_vectors, b_vectors, values} shape the original g.b Explorer's
    `data/{key}.json` files used -- backs the g.b Explorer panel embedded
    in Stage 7 (GET /api/materials/{id}/gb-table). `g_vectors` are
    formatted as "h k l" strings (space-separated, matching the dataset's
    own reflection notation); `b_vectors` are the dataset's original
    string labels (e.g. "110", "[100]") so display matches the standalone
    Explorer exactly. `values[i][j]` = g_vectors[i] . b_vectors[j],
    precomputed, never recomputed here.
    """
    structure = get_material(material_id)
    return {
        "id": structure.material_id,
        "name": structure.display_name,
        "crystal_system": structure.crystal_system,
        "index_notation": structure.index_notation,
        "requires_c_over_a": structure.requires_c_over_a,
        "g_vectors": [" ".join(str(int(x)) for x in g) for g in structure.g_vectors],
        "b_vectors": list(structure.b_vector_labels),
        "values": [list(row) for row in structure.values],
    }


def validate_gb_observation(material_id: str, miller_index: IndexVector, gb: Optional[int]) -> Tuple[bool, str]:
    """Structural validation only -- never overrides or infers the user's
    recorded value. Checks:
      1. the material id resolves to a real database,
      2. the reflection is one this material's table actually tabulates
         (catches typos/out-of-range indices early, before they reach the
         solver),
      3. the recorded g.b symbol is one of the three the UI offers
         (+1, 0, -1).
    """
    try:
        structure = get_material(material_id)
    except CrystallographyLoadError as exc:
        return False, str(exc)

    hkl = tuple(int(x) for x in miller_index)
    if hkl not in structure.g_vectors:
        return False, (
            f"Reflection {list(hkl)} is not in {structure.display_name}'s tabulated "
            f"reflection range -- double-check the Miller index assigned in Stage 2."
        )

    if gb is not None and gb not in (-1, 0, 1):
        return False, "Observed g.b must be one of +1, 0, -1."

    return True, ""


def solve_candidates(
    material_id: str,
    invisible_g: List[IndexVector],
    visible_g: List[IndexVector],
) -> SolveResult:
    """Runs the ported BurgersSolver algorithm (solver.py) for one pair's
    recorded observations against one material's Burgers-vector family."""
    structure = get_material(material_id)
    return _solver.solve(structure, invisible_g, visible_g)


def fully_consistent_candidates(result: SolveResult) -> List[BurgersCandidate]:
    return _solver.fully_consistent_candidates(result)
