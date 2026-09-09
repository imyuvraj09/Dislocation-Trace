"""
crystallography/vector_math.py
================================
Ported from g.b's `math/vector.js` (window.VectorUtils). Kept as a
direct, function-for-function port rather than reaching for numpy so the
solving logic in solver.py stays traceable back to the original
JavaScript it was ported from -- see solver.py's module docstring.

Only `parse` differs meaningfully from the original: g.b's version reads
free-text UI input (with hexagonal 4-index dot-separated notation etc.);
CrystalTrace never collects free-text vectors from the user (see the
scientific design philosophy in the integration spec), so this port is
kept only for parsing the *dataset's* own b_vector strings, which use
the same compact "110" / "1-10" / "[100]" notation as the original.
"""

from __future__ import annotations

import re
from typing import List, Optional, Sequence, Tuple

Vec3 = Tuple[float, float, float]

_BRACKETS_RE = re.compile(r"^[\[\({]+|[\]\)}]+$")
_SIGNED_DIGIT_RE = re.compile(r"-?\d")


def parse(s: str) -> Optional[List[float]]:
    """Parses a compact vector string ("110", "1-10", "[100]", "01-1.1")
    into a numeric list. Mirrors VectorUtils.parse exactly, including its
    hexagonal 4-index dot-separated handling."""
    if not s or not s.strip():
        return None
    s = s.strip()
    s = _BRACKETS_RE.sub("", s)

    parts: List[str]
    if "." in s:
        dot_parts = s.split(".")
        first_part = _SIGNED_DIGIT_RE.findall(dot_parts[0]) if dot_parts else []
        second_part = _SIGNED_DIGIT_RE.findall(dot_parts[1]) if len(dot_parts) > 1 else []
        parts = [*first_part, *second_part]
    elif " " in s or "," in s:
        parts = re.split(r"[\s,]+", s)
    else:
        parts = _SIGNED_DIGIT_RE.findall(s)

    arr: List[float] = []
    for p in parts:
        try:
            arr.append(float(p))
        except (TypeError, ValueError):
            continue

    return arr if len(arr) >= 3 else None


def dot(v1: Sequence[float], v2: Sequence[float]) -> float:
    """Dot product for equal-length three- or four-index sequences."""
    if len(v1) != len(v2) or len(v1) < 3:
        return 0.0
    return sum(a * b for a, b in zip(v1, v2))


def cross(v1: Sequence[float], v2: Sequence[float]) -> Vec3:
    if len(v1) < 3 or len(v2) < 3:
        return (0.0, 0.0, 0.0)
    return (
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0],
    )


def length(v: Sequence[float]) -> float:
    return (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5


def normalize(v: Sequence[float]) -> Vec3:
    n = length(v)
    if n == 0:
        return (0.0, 0.0, 0.0)
    return (v[0] / n, v[1] / n, v[2] / n)


def are_parallel(v1: Sequence[float], v2: Sequence[float], epsilon: float = 1e-4) -> bool:
    """True if v1 and v2 are parallel or antiparallel."""
    n1 = normalize(v1)
    n2 = normalize(v2)
    dot_val = dot(n1, n2)
    return abs(abs(dot_val) - 1) < epsilon
