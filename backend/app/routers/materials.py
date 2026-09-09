"""
Materials -- read-only access to the crystallography reference service
(crystallography/queries.py). Additive to the existing 9 stage routers;
not itself a pipeline stage (material selection is project-level
metadata, not a numbered stage -- see the integration plan).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from crystallography import queries
from crystallography.loader import CrystallographyLoadError

router = APIRouter(prefix="/api/materials", tags=["Materials"])


@router.get("")
async def list_materials(q: Optional[str] = Query(None, description="Optional case-insensitive search string")):
    if q:
        return {"materials": queries.lookup_material(q)}
    return {"materials": queries.list_materials()}


@router.get("/{material_id}")
async def get_material(material_id: str):
    try:
        structure = queries.get_material(material_id)
    except CrystallographyLoadError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {
        "id": structure.material_id,
        "name": structure.display_name,
        "crystalSystem": structure.crystal_system,
        "indexNotation": structure.index_notation,
        "requiresCOverA": structure.requires_c_over_a,
        "burgersVectorFamily": [
            {"label": label, "vector": list(vec)}
            for label, vec in zip(structure.b_vector_labels, structure.b_vectors)
        ],
        "reflectionCount": len(structure.g_vectors),
    }


@router.get("/{material_id}/gb-table")
async def get_gb_table(material_id: str):
    """Backs the g.b Explorer panel embedded in Stage 7 (Classification).
    Full {name, g_vectors, b_vectors, values} table for one material --
    the same shape the standalone g.b Explorer's data/{key}.json files
    used, so the panel's dataset table / search / visualize / truth table
    / common-b-finder logic can run entirely client-side against one
    fetched payload, exactly as the original app did."""
    try:
        return queries.get_gb_table(material_id)
    except CrystallographyLoadError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
