"""
modules/batch_reporter.py
=========================
Stage 9 — batch CSV output and console summary.

Changes from the uploaded draft
--------------------------------
* BatchReporter.add() now accepts typed dataclasses (LinePair, AngleRow,
  SolveResult, TrueLineResult, ClassifyResult) instead of plain dicts.
* Added the five standalone functions that __init__.py expects:
    write_lines_csv, write_gvec_csv, write_angles_csv,
    write_batch_csv, print_summary.
* FinalResult is assembled and stored so write_batch_csv can serialise it.

Output CSV schema
-----------------
pair_id, tem_image_1, tem_image_2, b1, b2, burgers,
g_ids_TEM1, theta_TEM1_deg, miller_TEM1,
g_ids_TEM2, theta_TEM2_deg, miller_TEM2,
Up1_raw, Up1_norm, Up1_miller, rank_TEM1, zone_fix_TEM1,
  residual_TEM1, signs_TEM1, UpB_dot_TEM1,
Up2_raw, Up2_norm, Up2_miller, rank_TEM2, zone_fix_TEM2,
  residual_TEM2, signs_TEM2, UpB_dot_TEM2,
U_raw, U_norm, U_miller,
character, ub_angle_deg, slip_miller, burgers_vec
"""

from __future__ import annotations

import csv
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from .pipeline_types import (
    AngleRow, ClassifyResult, DetectedLine,
    FinalResult, GVector, LinePair,
    SolveResult, TrueLineResult,
)

logger = logging.getLogger(__name__)

# ── CSV schemas ───────────────────────────────────────────────────────────────

_LINE_SCHEMA = [
    "image", "label", "color",
    "x1", "y1", "x2", "y2", "vx", "vy", "length_px",
]

_GVEC_SCHEMA = [
    "source", "g_id",
    "ox", "oy", "tx", "ty", "vx", "vy", "length_px",
    "miller_h", "miller_k", "miller_i", "miller_l",
]

_ANGLE_SCHEMA = [
    "pair_id", "image", "line_id", "g_id",
    "line_vx", "line_vy", "g_vx", "g_vy",
    "raw_deg", "acute_deg",
]

_BATCH_SCHEMA = [
    "Pair ID",
    "TEM Image 1",
    "TEM Image 2",
    "Indexed true line direction (uT)",
    "Continuous normalized uT—full precision",
    "uT indexing deviation (°)",
    "Selected Burgers vector (b)",
    "Character",
    "Angle between uT and b (°)",
    "Continuous slip-plane normal—full precision",
    "Integer-indexed slip plane",
    "Closest low-index slip plane",
    "Low-index plane family",
    "Low-index deviation (°)",
    "Slip system",
    "Residual",
    "Status",
]



# ── Format helpers ────────────────────────────────────────────────────────────

def _fv(v, d: int = 2) -> str:
    if v is None:
        return ""
    if isinstance(v, np.ndarray):
        v = v.tolist()
    return "[" + " ".join(f"{float(x):.{d}f}" for x in v) + "]"


def _fv_full_precision(v) -> str:
    """Round-trip-safe representation of a continuous float vector."""
    if v is None:
        return ""
    if isinstance(v, np.ndarray):
        v = v.tolist()
    return "[" + " ".join(format(float(x), ".17g") for x in v) + "]"


def _fd(value: Optional[float]) -> str:
    return "" if value is None else format(float(value), ".12g")


def _fm(m) -> str:
    if m is None:
        return "Undefined"
    if isinstance(m, np.ndarray):
        m = m.tolist()
    return "[" + " ".join(str(int(x)) for x in m) + "]"


def _fs(s) -> str:
    if s is None:
        return ""
    return "(" + " ".join("+" if int(x) > 0 else "-" for x in s) + ")"


def _format_slip_miller(slip_miller) -> str:
    """Format slip plane Miller indices in crystallographic (hkl) notation.
    Returns 'Undefined' for None or (0,0,0) — never outputs (000)."""
    if slip_miller is None:
        return "Undefined"
    if isinstance(slip_miller, np.ndarray):
        slip_miller = slip_miller.tolist()
    if isinstance(slip_miller, (list, tuple)):
        ints = [int(x) for x in slip_miller]
        if all(x == 0 for x in ints):
            return "Undefined"
        return "(" + " ".join(str(x) for x in ints) + ")"
    return "Undefined"


def _format_slip_system(slip_miller, burgers_vec) -> str:
    """Format the full slip system as (hkl)[uvw].
    Returns 'Undefined' when the slip plane is undefined."""
    if slip_miller is None or burgers_vec is None:
        return "Undefined"
    sm = [int(x) for x in (slip_miller if isinstance(slip_miller, (list, tuple, np.ndarray)) else [0, 0, 0])]
    bv = [int(x) for x in (burgers_vec if isinstance(burgers_vec, (list, tuple, np.ndarray)) else [0, 0, 0])]
    if all(x == 0 for x in sm):
        return "Undefined"
    plane_str = "(" + "".join(str(x) for x in sm) + ")"
    burger_str = "[" + "".join(str(x) for x in bv) + "]"
    return f"{plane_str}{burger_str}"


def _up_miller(sr: SolveResult):
    """Index a Cartesian Up vector using the same geometry as its solve."""
    if sr.crystal_system == "cubic":
        from .true_line_solver import reduce_miller
        return reduce_miller(sr.Up_norm)
    from crystallography.geometry import CrystalGeometry
    return CrystalGeometry(sr.crystal_system, sr.c_over_a).cartesian_to_direction(sr.Up_norm)


def _make_batch_row(
    pair_id: str,
    sr1: SolveResult,
    sr2: SolveResult,
    true_line: TrueLineResult,
    clf: ClassifyResult,
) -> Dict[str, Any]:
    """Assemble a row dictionary conforming to the unified 17-column schema."""
    from crystallography.geometry import CrystalGeometry

    geometry = CrystalGeometry(true_line.crystal_system, true_line.c_over_a)

    pair_label = pair_id
    tem1 = sr1.image
    tem2 = sr2.image

    u_miller_str = _fm(true_line.U_miller) if true_line.U_miller is not None else "Undefined"
    u_norm_str = _fv_full_precision(true_line.U_norm)

    if true_line.U_miller is not None:
        u_dev = geometry.direction_indexing_deviation_deg(true_line.U_norm, true_line.U_miller)
        u_dev_str = f"{u_dev:.2f}"
    else:
        u_dev_str = "N/A"

    burgers_str = _fm(clf.burgers.astype(int))
    character_str = clf.character
    ub_angle_str = f"{clf.ub_angle_deg:.2f}"

    is_pure_screw = (
        (clf.character == "Screw")
        or (clf.low_index_family == "N/A" and clf.closest_low_index_plane_str == "Not uniquely determined")
        or (np.linalg.norm(clf.slip_raw) < 1e-8)
    )

    if is_pure_screw:
        cont_slip_str = "Not uniquely determined"
        int_slip_str = "Not uniquely determined"
        closest_plane_str = "Not uniquely determined"
        low_family_str = "N/A"
        low_dev_str = "N/A"
        slip_system_str = "Plane not uniquely determined for screw dislocation"
    else:
        cont_slip_str = _fv_full_precision(clf.slip_raw)
        int_slip_str = _format_slip_miller(clf.slip_miller) if clf.slip_miller is not None else "Not uniquely determined"
        closest_plane_str = clf.closest_low_index_plane_str or "No compatible catalogue plane"
        low_family_str = clf.low_index_family if clf.low_index_family else "N/A"
        low_dev_str = f"{clf.low_index_deviation_deg:.2f}" if clf.low_index_deviation_deg is not None else "N/A"
        slip_system_str = clf.low_index_slip_system if clf.low_index_slip_system else "N/A"

    if sr1.residual is not None and sr2.residual is not None:
        residual_str = f"{sr1.residual:.3e} / {sr2.residual:.3e}"
    elif sr1.residual is not None:
        residual_str = f"{sr1.residual:.3e}"
    else:
        residual_str = ""

    status_str = "OK"

    return {
        "Pair ID": pair_label,
        "TEM Image 1": tem1,
        "TEM Image 2": tem2,
        "Indexed true line direction (uT)": u_miller_str,
        "Continuous normalized uT—full precision": u_norm_str,
        "uT indexing deviation (°)": u_dev_str,
        "Selected Burgers vector (b)": burgers_str,
        "Character": character_str,
        "Angle between uT and b (°)": ub_angle_str,
        "Continuous slip-plane normal—full precision": cont_slip_str,
        "Integer-indexed slip plane": int_slip_str,
        "Closest low-index slip plane": closest_plane_str,
        "Low-index plane family": low_family_str,
        "Low-index deviation (°)": low_dev_str,
        "Slip system": slip_system_str,
        "Residual": residual_str,
        "Status": status_str,

        # Legacy/internal key aliases
        "pair_id": pair_id,
        "pair_label": pair_label,
        "tem_image_1": tem1,
        "tem_image_2": tem2,
        "U_miller": u_miller_str,
        "U_norm": u_norm_str,
        "U_indexing_deviation_deg": u_dev_str,
        "burgers": burgers_str,
        "burgers_vec": burgers_str,
        "character": character_str,
        "ub_angle_deg": ub_angle_str,
        "slip_plane_normal": cont_slip_str,
        "slip_miller": int_slip_str,
        "closest_low_index_plane_str": closest_plane_str,
        "low_index_family": low_family_str,
        "low_index_deviation_deg": low_dev_str,
        "slip_system": slip_system_str,
        "residual_TEM1": f"{sr1.residual:.3e}" if sr1.residual is not None else "",
        "residual_TEM2": f"{sr2.residual:.3e}" if sr2.residual is not None else "",
        "crystal_system": true_line.crystal_system,
        "c_over_a": format(float(true_line.c_over_a), ".17g") if true_line.c_over_a else None,
    }


# ── Standalone CSV writers (required by __init__.py) ─────────────────────────

def write_lines_csv(lines: List[DetectedLine], path: str) -> None:
    """Write detected dislocation lines to CSV."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=_LINE_SCHEMA)
        w.writeheader()
        for ln in lines:
            w.writerow({
                "image": ln.image, "label": ln.label, "color": ln.color,
                "x1": ln.x1, "y1": ln.y1, "x2": ln.x2, "y2": ln.y2,
                "vx": ln.vx, "vy": ln.vy, "length_px": ln.length_px,
            })
    logger.info(f"Saved {len(lines)} line(s) → {path}")


def write_gvec_csv(gvecs: List[GVector], path: str) -> None:
    """Write g-vectors (with Miller indices) to CSV."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=_GVEC_SCHEMA)
        w.writeheader()
        for g in gvecs:
            indices = tuple(g.hkl) if g.hkl else ()
            if len(indices) == 4:
                h, k, i, l = indices
            else:
                h, k, l = indices if len(indices) == 3 else ("", "", "")
                i = ""
            w.writerow({
                "source": g.source, "g_id": g.g_id,
                "ox": g.ox, "oy": g.oy, "tx": g.tx, "ty": g.ty,
                "vx": g.vx, "vy": g.vy, "length_px": g.length_px,
                "miller_h": h, "miller_k": k, "miller_i": i, "miller_l": l,
            })
    logger.info(f"Saved {len(gvecs)} g-vector(s) → {path}")


def write_angles_csv(rows: List[AngleRow], path: str) -> None:
    """Write pixel-space angle rows to CSV."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=_ANGLE_SCHEMA)
        w.writeheader()
        for r in rows:
            w.writerow({
                "pair_id": r.pair_id, "image": r.image,
                "line_id": r.line_id, "g_id": r.g_id,
                "line_vx": r.line_vx, "line_vy": r.line_vy,
                "g_vx": r.g_vx, "g_vy": r.g_vy,
                "raw_deg": r.raw_deg, "acute_deg": r.acute_deg,
            })
    logger.info(f"Saved {len(rows)} angle row(s) → {path}")


def write_batch_csv(results: List[Any], path: str) -> None:
    """
    Write batch results to CSV.
    """
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

    rows = []
    for item in results:
        if isinstance(item, FinalResult):
            rows.append(_final_to_row(item))
        else:
            rows.append(item)

    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=_BATCH_SCHEMA, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    logger.info(f"Saved {len(rows)} result(s) → {path}")


def print_summary(results) -> None:
    """
    Print a compact console summary.
    """
    if hasattr(results, "_records"):
        records = results._records
    else:
        records = [_final_to_row(r) if isinstance(r, FinalResult) else r
                   for r in results]

    if not records:
        print("  No results to summarise.")
        return

    W = 150
    print("\n" + "═" * W)
    print(f"{'DISLOCATION ANALYSIS  —  SUMMARY':^{W}}")
    print("═" * W)
    print(f"{'Pair':<10} {'TEM1':^12} {'TEM2':^12} {'uT':^12} {'uT dev°':^9} "
          f"{'b':^12} {'Char':^20} {'∠(uT,b)°':^9} {'Slip normal':^30} {'Low-index slip':^18} {'Slip System':^20}")
    print("─" * W)
    for r in records:
        pair_label = r.get("Pair ID") or r.get("pair_label") or r.get("pair_id", "")
        print(f"{str(pair_label):<10} "
              f"{str(r.get('TEM Image 1', r.get('tem_image_1', ''))):^12.12} "
              f"{str(r.get('TEM Image 2', r.get('tem_image_2', ''))):^12.12} "
              f"{str(r.get('Indexed true line direction (uT)', r.get('U_miller', ''))):^12} "
              f"{str(r.get('uT indexing deviation (°)', '')):^9} "
              f"{str(r.get('Selected Burgers vector (b)', r.get('burgers', ''))):^12} "
              f"{str(r.get('Character', r.get('character', ''))):^20} "
              f"{str(r.get('Angle between uT and b (°)', r.get('ub_angle_deg', ''))):^9} "
              f"{str(r.get('Continuous slip-plane normal—full precision', r.get('slip_plane_normal', ''))):^30} "
              f"{str(r.get('Closest low-index slip plane', r.get('closest_low_index_plane_str', ''))):^18} "
              f"{str(r.get('Slip system', r.get('slip_system', ''))):^20}")
    print("═" * W)
    chars = [r.get("Character") or r.get("character") for r in records]
    for c in ("Screw", "Mixed-Screw-Dominant", "Mixed-Edge-Dominant", "Edge"):
        n = chars.count(c)
        if n:
            print(f"  {c}: {n} pair(s)")
    print()


# ── Internal: FinalResult → dict row ─────────────────────────────────────────

def _final_to_row(fr: FinalResult) -> Dict[str, Any]:
    return _make_batch_row(fr.pair_id, fr.sr1, fr.sr2, fr.true_line, fr.classify)


# ── BatchReporter class ───────────────────────────────────────────────────────

class BatchReporter:
    """
    Accumulates per-pair results and writes the final batch CSV + summary.

    Usage
    -----
    reporter = BatchReporter("outputs")
    reporter.add(pair, angle_rows, sr1, sr2, true_line, clf, B1, B2, burgers)
    reporter.write()
    reporter.print_summary()
    """

    def __init__(self, out_dir: str = str(Path(__file__).resolve().parent / "outputs")):
        self.out_dir = out_dir
        self._records: List[Dict[str, Any]] = []
        self._finals:  List[FinalResult]    = []

    def add(
        self,
        pair:       LinePair,
        angle_rows: List[AngleRow],
        sr1:        SolveResult,
        sr2:        SolveResult,
        true_line:  TrueLineResult,
        clf:        ClassifyResult,
        B1:         np.ndarray,
        B2:         np.ndarray,
        burgers:    np.ndarray,
        gvecs1:     Optional[List[GVector]] = None,
        gvecs2:     Optional[List[GVector]] = None,
    ) -> None:
        """Record one complete pair result using typed dataclasses."""
        rec = _make_batch_row(pair.pair_id, sr1, sr2, true_line, clf)
        self._records.append(rec)
        self._finals.append(FinalResult(
            pair_id=pair.pair_id, sr1=sr1, sr2=sr2,
            true_line=true_line, classify=clf,
        ))
        logger.info(f"  Recorded {pair.pair_id}: {clf.character}  U={rec['Indexed true line direction (uT)']}")

    def write(self, force: bool = True) -> str:
        """Write batch_results.csv into out_dir. Returns the file path."""
        if not self._records:
            logger.warning("BatchReporter.write(): nothing to write.")
            return ""
        os.makedirs(self.out_dir, exist_ok=True)
        path = os.path.join(self.out_dir, "batch_results.csv")
        if os.path.exists(path) and not force:
            raise FileExistsError(f"{path} exists. Pass force=True to overwrite.")
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(
                f,
                fieldnames=_BATCH_SCHEMA,
                extrasaction="ignore",
            )
            w.writeheader()
            w.writerows(self._records)
        logger.info(f"Batch results: {len(self._records)} pair(s) → {path}")
        return path

    def print_summary(self) -> None:
        print_summary(self)
