"""One-time converter for the legacy HCP hkl/uvw reference table.

Usage from the repository root::

    python backend/crystallography/convert_hcp_database.py \
        backend/crystallography/data/HCP_Hexagonal_Close_Packed.json \
        frontend/public/data/HCP_Hexagonal_Close_Packed.json

The converted file stores HCP planes as space-separated h k i l strings,
directions as space-separated u v t w strings, and recomputes the complete
zone-law table in the same notation. Running it on an already converted file
is safe and leaves the data unchanged.
"""

from __future__ import annotations

import json
import math
import re
import sys
from functools import reduce
from pathlib import Path


def _parse(raw: str) -> tuple[int, ...]:
    if " " in raw.strip() or "," in raw:
        return tuple(int(x) for x in re.split(r"[\s,]+", raw.strip("[](){} ")) if x)
    return tuple(int(x) for x in re.findall(r"-?\d", raw.strip("[](){} ")))


def _reduce(values: tuple[int, ...]) -> tuple[int, ...]:
    nonzero = [abs(x) for x in values if x]
    divisor = reduce(math.gcd, nonzero) if nonzero else 1
    return tuple(x // divisor for x in values)


def _plane_to_four(hkl: tuple[int, ...]) -> tuple[int, int, int, int]:
    if len(hkl) == 4:
        h, k, i, l = hkl
        if i != -(h + k):
            raise ValueError(f"Invalid HCP plane {hkl}: i must equal -(h+k).")
        return h, k, i, l
    h, k, l = hkl
    return h, k, -(h + k), l


def _direction_to_four(uvw: tuple[int, ...]) -> tuple[int, int, int, int]:
    if len(uvw) == 4:
        u, v, t, w = uvw
        if t != -(u + v):
            raise ValueError(f"Invalid HCP direction {uvw}: t must equal -(u+v).")
        return u, v, t, w
    U, V, W = uvw
    return _reduce((2 * U - V, 2 * V - U, -(U + V), 3 * W))  # type: ignore[return-value]


def convert(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    planes = [_plane_to_four(_parse(raw)) for raw in data.get("g_vectors", [])]
    directions = [_direction_to_four(_parse(raw)) for raw in data.get("b_vectors", [])]

    data["index_notation"] = "Miller-Bravais hkil / uvtw"
    data["g_vectors"] = [" ".join(str(x) for x in plane) for plane in planes]
    data["b_vectors"] = [" ".join(str(x) for x in direction) for direction in directions]
    data["values"] = [
        [sum(g_component * b_component for g_component, b_component in zip(plane, direction))
         for direction in directions]
        for plane in planes
    ]
    path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Pass one or more HCP database JSON paths.")
    for argument in sys.argv[1:]:
        convert(Path(argument))

