"""Validation and session binding for the selected crystal geometry."""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException

from crystallography import queries
from crystallography.geometry import CrystalGeometry
from crystallography.loader import CrystallographyLoadError


def bind_crystal_context(session, material_id: str, c_over_a: Optional[float]) -> CrystalGeometry:
    """Resolve a supported material and persist its calculation context."""
    try:
        structure = queries.get_material(material_id)
        geometry = CrystalGeometry(structure.crystal_system, c_over_a)
    except CrystallographyLoadError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    material_changed = session.material_id is not None and session.material_id != material_id
    ratio_changed = (
        session.c_over_a is not None
        and geometry.c_over_a is not None
        and abs(session.c_over_a - geometry.c_over_a) > 1e-12
    )
    if material_changed or ratio_changed:
        # Derived crystallographic results must never survive a change of
        # lattice geometry. Image detection, pairing, and pixel angles remain
        # valid and are intentionally retained.
        session.solve_results.clear()
        session.true_lines.clear()
        session.classify_results.clear()
        session.gb_observations.clear()
        session.burgers = None

    session.material_id = material_id
    session.crystal_system = geometry.crystal_system
    session.c_over_a = geometry.c_over_a
    return geometry


def geometry_from_session(session) -> CrystalGeometry:
    """Return the active context, preserving cubic compatibility by default."""
    try:
        return CrystalGeometry(session.crystal_system, session.c_over_a)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
