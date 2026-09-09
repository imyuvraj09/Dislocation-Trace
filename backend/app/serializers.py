"""
app/serializers.py
===================
Converts the pipeline's dataclasses (DetectedLine, GVector, LinePair,
GVecSelection, AngleRow, SolveResult, TrueLineResult, ClassifyResult,
FinalResult -- all defined in fileskh/pipeline_types.py) into plain,
JSON-safe dicts for the REST API.

This module is pure glue: it never imports from or modifies the
scientific pipeline logic itself, it only reads dataclass fields that
are already public.
"""

from __future__ import annotations

import dataclasses
from typing import Any

import numpy as np


def _to_jsonable(value: Any) -> Any:
    """Recursively convert numpy / tuple / dataclass values to JSON-safe types."""
    if isinstance(value, np.ndarray):
        return [round(float(x), 6) for x in value.tolist()]
    if isinstance(value, (np.floating,)):
        return round(float(value), 6)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, tuple):
        return [_to_jsonable(v) for v in value]
    if isinstance(value, list):
        return [_to_jsonable(v) for v in value]
    if dataclasses.is_dataclass(value):
        return serialize(value)
    return value


def _to_jsonable_full_precision(value: Any) -> Any:
    """JSON conversion without the legacy six-decimal vector rounding."""
    if isinstance(value, np.ndarray):
        return [float(x) for x in value.tolist()]
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, tuple):
        return [_to_jsonable_full_precision(v) for v in value]
    if isinstance(value, list):
        return [_to_jsonable_full_precision(v) for v in value]
    if dataclasses.is_dataclass(value):
        return serialize(value)
    return value


def _non_cubic_indexing_metadata(obj: Any) -> dict[str, float]:
    """Calculate diagnostic index-to-Cartesian angular deviations."""
    crystal_system = getattr(obj, "crystal_system", "cubic")
    if crystal_system not in ("hcp", "tetragonal"):
        return {}

    from crystallography.geometry import CrystalGeometry

    geometry = CrystalGeometry(crystal_system, getattr(obj, "c_over_a", None))
    metadata: dict[str, float] = {}

    u_norm = getattr(obj, "U_norm", None)
    u_miller = getattr(obj, "U_miller", None)
    if u_norm is not None and u_miller is not None:
        metadata["U_indexing_deviation_deg"] = geometry.direction_indexing_deviation_deg(
            u_norm,
            u_miller,
        )

    slip_raw = getattr(obj, "slip_raw", None)
    slip_miller = getattr(obj, "slip_miller", None)
    if slip_raw is not None and slip_miller is not None:
        metadata["slip_plane_indexing_deviation_deg"] = geometry.plane_indexing_deviation_deg(
            slip_raw,
            slip_miller,
        )

    return metadata


def serialize(obj: Any) -> Any:
    """Serialize any pipeline dataclass instance (or plain dict/list) to JSON-safe data."""
    if obj is None:
        return None
    if dataclasses.is_dataclass(obj):
        converter = _to_jsonable_full_precision
        out = {}
        for f in dataclasses.fields(obj):
            out[f.name] = converter(getattr(obj, f.name))
        out.update(_non_cubic_indexing_metadata(obj))
        return out
    if isinstance(obj, (list, tuple)):
        return [serialize(o) for o in obj]
    if isinstance(obj, dict):
        return {k: serialize(v) for k, v in obj.items()}
    return _to_jsonable(obj)
