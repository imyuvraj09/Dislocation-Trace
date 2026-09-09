"""
crystallography/loader.py
===========================
Loads the crystal-structure reference databases (reused verbatim from
the g.b project -- see crystallography/data/*.json and manifest.json)
exactly once per process and caches them in memory, mirroring the
pattern already used by app/session_store.py's module-level `SESSIONS`
singleton.

Two real inconsistencies exist across the raw g.b JSON files (confirmed
by inspection -- not hypothetical) and are normalized here, in exactly
one place, so nothing downstream has to special-case them:

  1. Most files key the display name as "name"; B2_Ordered_BCC.json uses
     "crystal" instead.
  2. Most files write b_vectors unbracketed ("110", "1-10"); B2 and a
     handful of others wrap them in brackets ("[100]", "[-100]").

Nothing here regenerates or duplicates the underlying data -- it only
parses the existing values into the typed `CrystalStructure` shape.
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path
from typing import Dict, List, Tuple

from .models import CrystalStructure
from .vector_math import parse as parse_vector
from .geometry import (
    crystal_system_for_material,
    index_notation_for_system,
    requires_c_over_a,
)

DATA_DIR = Path(__file__).resolve().parent / "data"
MANIFEST_PATH = DATA_DIR / "manifest.json"

_BRACKETS_RE = re.compile(r"^[\[\({]+|[\]\)}]+$")


class CrystallographyLoadError(RuntimeError):
    """Raised when a material id has no matching database on disk."""


def _load_manifest() -> Dict[str, str]:
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _parse_g_vector(raw: str, expected_count: int) -> Tuple[int, ...]:
    parts = parse_vector(raw)
    if not parts or len(parts) != expected_count:
        raise CrystallographyLoadError(f"Malformed g-vector entry: {raw!r}")
    return tuple(int(x) for x in parts)


def _dedupe_b_vectors(b_vectors: List[str], values: List[List[int]]) -> Tuple[List[str], List[List[int]]]:
    """Mirrors g.b's DatasetLoader.load(): some files repeat a Burgers
    vector under two different string spellings (bracketed vs not) --
    keep the first occurrence of each normalized form only."""
    seen = set()
    keep_indices: List[int] = []
    unique_labels: List[str] = []
    for j, b in enumerate(b_vectors):
        norm = _BRACKETS_RE.sub("", b.strip())
        if norm not in seen:
            seen.add(norm)
            keep_indices.append(j)
            unique_labels.append(b)

    if len(unique_labels) == len(b_vectors):
        return b_vectors, values

    deduped_values = [[row[idx] for idx in keep_indices] for row in values]
    return unique_labels, deduped_values


def _parse_dataset(material_id: str, raw: dict) -> CrystalStructure:
    display_name = raw.get("name") or raw.get("crystal") or material_id
    try:
        crystal_system = crystal_system_for_material(material_id)
    except ValueError as exc:
        raise CrystallographyLoadError(str(exc)) from exc
    index_notation = index_notation_for_system(crystal_system)
    expected_count = 4 if crystal_system == "hcp" else 3

    b_labels_raw = raw.get("b_vectors", [])
    values_raw = raw.get("values", [])
    b_labels, values = _dedupe_b_vectors(b_labels_raw, values_raw)

    b_vectors: List[Tuple[float, ...]] = []
    for label in b_labels:
        parsed = parse_vector(label)
        if not parsed:
            raise CrystallographyLoadError(
                f"Malformed b-vector entry {label!r} in material '{material_id}'"
            )
        if len(parsed) != expected_count:
            raise CrystallographyLoadError(
                f"Expected {expected_count} indices in b-vector {label!r} for "
                f"material '{material_id}', got {len(parsed)}."
            )
        b_vectors.append(tuple(parsed))

    g_vectors = [_parse_g_vector(g, expected_count) for g in raw.get("g_vectors", [])]

    return CrystalStructure(
        material_id=material_id,
        display_name=display_name,
        crystal_system=crystal_system,
        index_notation=index_notation,
        requires_c_over_a=requires_c_over_a(crystal_system),
        g_vectors=g_vectors,
        b_vectors=b_vectors,
        b_vector_labels=b_labels,
        values=values,
    )


class _CrystallographyRegistry:
    """Thread-safe, load-once, in-memory cache of CrystalStructure datasets.

    Loaded lazily on first request per material id (not eagerly for all
    16 on process start) but never reloaded afterwards -- one dataset
    read from disk per material for the lifetime of the process, per the
    PERFORMANCE requirements in the integration spec.
    """

    def __init__(self) -> None:
        # RLock, not Lock: get() holds this lock while it calls
        # self.manifest(), which itself acquires the same lock on its own
        # first call -- a plain Lock would deadlock on that reentry.
        self._lock = threading.RLock()
        self._cache: Dict[str, CrystalStructure] = {}
        self._manifest: Dict[str, str] | None = None

    def manifest(self) -> Dict[str, str]:
        if self._manifest is None:
            with self._lock:
                if self._manifest is None:
                    self._manifest = _load_manifest()
        return self._manifest

    def list_material_ids(self) -> List[str]:
        return list(self.manifest().keys())

    def get(self, material_id: str) -> CrystalStructure:
        if material_id in self._cache:
            return self._cache[material_id]

        with self._lock:
            if material_id in self._cache:
                return self._cache[material_id]

            if material_id not in self.manifest():
                raise CrystallographyLoadError(
                    f"Unknown material id '{material_id}'. "
                    f"See GET /api/materials for valid ids."
                )

            path = DATA_DIR / f"{material_id}.json"
            if not path.exists():
                raise CrystallographyLoadError(
                    f"Manifest lists '{material_id}' but its database file is missing: {path}"
                )

            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)

            dataset = _parse_dataset(material_id, raw)
            self._cache[material_id] = dataset
            return dataset


REGISTRY = _CrystallographyRegistry()
