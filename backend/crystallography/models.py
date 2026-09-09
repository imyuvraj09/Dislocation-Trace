"""
crystallography/models.py
==========================
Shared dataclasses for the crystallography reference service. Mirrors the
naming convention of fileskh/pipeline_types.py -- every other module in
this package imports its types from here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class CrystalStructure:
    """One normalized crystal-structure reference dataset (one g.b JSON file).

    `material_id` is the manifest key (e.g. "FCC_Face_Centered_Cubic") --
    this is the only thing CrystalTrace ever persists in a project file
    (see PROJECT MODEL in the integration spec); everything else here is
    re-derived from the on-disk database every time it's loaded.
    """
    material_id: str                 # manifest key, e.g. "FCC_Face_Centered_Cubic"
    display_name: str                # dataset's own "name"/"crystal" field, or the manifest's display string
    crystal_system: str              # "cubic" | "tetragonal" | "hcp"
    index_notation: str              # "hkl" | "hkil"
    requires_c_over_a: bool
    g_vectors: List[Tuple[int, ...]]       # hkl, or hkil for HCP
    b_vectors: List[Tuple[float, ...]]     # uvw, or uvtw for HCP
    b_vector_labels: List[str]        # the original string form of each b_vector, for display (e.g. "110")
    values: List[List[int]]           # values[i][j] = g_vectors[i] . b_vectors[j] (precomputed reference table)


@dataclass
class BurgersCandidate:
    """One candidate Burgers vector produced by `solver.solve()`."""
    label: str                # display label, e.g. "1/2[1 1 0]" (see solver.format_burgers_vector_label)
    b_vector: Tuple[float, ...]
    confidence: float         # 0..100
    matched_count: int
    total_count: int
    methods: List[str]        # e.g. ["Dataset Match", "Null Space", "Cross Product"]
    status: str               # "Verified" | "Unverified"


@dataclass
class SolveResult:
    """Full result of resolving candidate Burgers vectors from observations."""
    candidates: List[BurgersCandidate]
    math_derivation: str
    null_space_basis: List[Tuple[float, float, float]] = field(default_factory=list)


@dataclass
class GBObservationInput:
    """One experimental g.b observation, as recorded by the user in Stage 7."""
    image_id: str
    g_vector_id: str
    miller_index: Tuple[int, ...]
    gb: Optional[int]         # +1, 0, -1 (or None if not yet recorded)
    notes: str = ""
    timestamp: Optional[str] = None
