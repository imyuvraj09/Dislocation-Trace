"""
modules/types.py
================
Shared dataclasses for the TEM dislocation analysis pipeline.
Every module imports from here; nothing else should define these types.

Data-flow summary
-----------------
Stage 1  → DetectedLine, GVector
Stage 2  → GVector.hkl filled
Stage 3  → LinePair
Stage 4  → GVecSelection      (user picks 3 g-IDs per pair/image)
Stage 4  → AngleRow           (pixel-space angles, NO Miller indices)
Stage 5  → (confirmation; same types)
Stage 6  → SolveResult        (Up per image)
Stage 7  → TrueLineResult     (U from two Up vectors)
Stage 8  → ClassifyResult
Stage 9  → FinalResult        (everything combined)
"""

from __future__ import annotations

import importlib.util
import sysconfig
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np


def _load_stdlib_types_module():
    """Load the real standard-library types module even when this file shadows it."""
    stdlib_dir = Path(sysconfig.get_paths()["stdlib"])
    stdlib_types_path = stdlib_dir / "types.py"
    if not stdlib_types_path.exists():
        return None

    spec = importlib.util.spec_from_file_location("_stdlib_types", stdlib_types_path)
    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_stdlib_types = _load_stdlib_types_module()
if _stdlib_types is not None:
    for _name in dir(_stdlib_types):
        if not _name.startswith("__"):
            globals()[_name] = getattr(_stdlib_types, _name)


# ── Stage 1 ──────────────────────────────────────────────────────────────────

@dataclass
class DetectedLine:
    """One annotated dislocation line found in a TEM image."""
    label:     str           # "L1", "L2", …
    image:     str           # TEM image basename  e.g. "picture1.png"
    x1: int = 0
    y1: int = 0
    x2: int = 0
    y2: int = 0
    color:     str = "white" # "white", "red", "green", …
    vx: int = 0
    vy: int = 0              # pixel vector  = (x2-x1, y2-y1)
    length_px: float = 0.0   # |v| in pixels

    def __post_init__(self):
        if self.vx == 0 and self.vy == 0 and (self.x1 != self.x2 or self.y1 != self.y2):
            self.vx = self.x2 - self.x1
            self.vy = self.y2 - self.y1
        if self.length_px == 0.0 and (self.vx != 0 or self.vy != 0):
            self.length_px = float(np.hypot(self.vx, self.vy))


@dataclass
class GVector:
    """One g-vector arrow detected in a diffraction image."""
    g_id:      str           # "g01", "g02", …
    source:    str           # diff image basename  e.g. "df1.png"
    ox: int = 0
    oy: int = 0              # arrow origin  (diffraction centre)
    tx: int = 0
    ty: int = 0              # arrow tip  (pixels)
    vx: int = 0
    vy: int = 0              # pixel vector  = (tx-ox, ty-oy)
    length_px: float = 0.0
    # Three indices for cubic/tetragonal and four Miller--Bravais indices
    # for HCP.  The legacy field name is retained for API compatibility.
    hkl: Optional[Tuple[int, ...]] = None  # filled in Stage 2

    def __post_init__(self):
        if self.vx == 0 and self.vy == 0 and (self.ox != self.tx or self.oy != self.ty):
            self.vx = self.tx - self.ox
            self.vy = self.ty - self.oy
        if self.length_px == 0.0 and (self.vx != 0 or self.vy != 0):
            self.length_px = float(np.hypot(self.vx, self.vy))


# ── Stage 3 ──────────────────────────────────────────────────────────────────

@dataclass
class LinePair:
    """One cross-image line pair defined by the user."""
    pair_id: str             # "P1", "P2", …
    line1:   DetectedLine    # line from TEM image 1
    line2:   DetectedLine    # line from TEM image 2


# ── Stage 4 ──────────────────────────────────────────────────────────────────

@dataclass
class GVecSelection:
    """
    Exactly 3 g-vector IDs chosen by the user for one line in one pair.
    Only these three will have angles computed and feed Stage 6 equations.
    """
    pair_id:    str
    image:      str          # TEM image basename  (identifies the line)
    diff_image: str          # corresponding diff image basename
    g_ids:      List[str]    # exactly 3 IDs  e.g. ["g01", "g02", "g03"]


@dataclass
class AngleRow:
    """
    Pixel-space angle between one dislocation line and one g-vector.

    Important: Miller indices (hkl) are NOT used here.
    The angle is computed from pixel endpoints only:
        θ_raw  = angle between line.vector and g.pixel_vector  ∈ [0, 180°]
        θ_acute = fold θ_raw into [0, 90°]
    """
    pair_id:   str
    image:     str           # TEM image basename
    line_id:   str           # "L1", …
    g_id:      str           # "g01", …
    line_vx:   int
    line_vy:   int
    g_vx:      int
    g_vy:      int
    raw_deg:   float
    acute_deg: float


# ── Stage 6 ──────────────────────────────────────────────────────────────────

@dataclass
class SolveResult:
    """Up-vector solution for one line in one pair."""
    pair_id:  str
    image:    str
    line_id:  str
    Up_raw:   np.ndarray     # unnormalised lstsq solution
    Up_norm:  np.ndarray     # normalised
    B:        np.ndarray     # zone-axis beam direction used
    rank:     int            # rank of the 3×3 equation matrix
    signs:    Tuple          # best sign combination (±1, ±1, ±1)
    used_fix: bool           # True  if zone-axis row was appended
    residual: float          # RMS of  A·Up − signed_rhs
    method:   str            # human-readable solver description
    crystal_system: str = "cubic"
    c_over_a: Optional[float] = None
    B_indices: Optional[Tuple[float, ...]] = None


# ── Stage 7 ──────────────────────────────────────────────────────────────────

@dataclass
class TrueLineResult:
    """
    True 3-D dislocation line direction.

        n1 = Up1 × B1
        n2 = Up2 × B2
        U  = n1  × n2
    """
    pair_id:  str
    n1:       np.ndarray
    n2:       np.ndarray
    U_raw:    np.ndarray
    U_norm:   np.ndarray
    U_miller: Optional[Tuple[int, ...]]
    crystal_system: str = "cubic"
    c_over_a: Optional[float] = None

    @property
    def u_T(self) -> np.ndarray:
        return self.U_norm


# ── Stage 8 ──────────────────────────────────────────────────────────────────

@dataclass
class ClassifyResult:
    """Character and slip plane for one pair."""
    pair_id:      str
    burgers:      np.ndarray
    ub_angle_deg: float
    character:    str           # "Screw" | "Mixed-Screw-Dominant" | "Mixed-Edge-Dominant" | "Edge"
    slip_raw:     np.ndarray    # b × U  (unnormalised)
    slip_miller:  Optional[Tuple[int, ...]]
    crystal_system: str = "cubic"
    c_over_a: Optional[float] = None
    closest_low_index_plane: Optional[Tuple[int, ...]] = None
    closest_low_index_plane_str: str = "Undefined"
    low_index_family: str = "N/A"
    low_index_deviation_deg: Optional[float] = None
    low_index_slip_system: str = "Undefined"
    structure_key: str = "FCC"


# ── Stage 9 ──────────────────────────────────────────────────────────────────

@dataclass
class FinalResult:
    """All outputs for one pair — written to batch_results.csv."""
    pair_id:    str
    sr1:        SolveResult
    sr2:        SolveResult
    true_line:  TrueLineResult
    classify:   ClassifyResult
