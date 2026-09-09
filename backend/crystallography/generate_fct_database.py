"""Generate the Face-Centered Tetragonal g.b reference database.

FCT uses the conventional tetragonal [u v w]/(h k l) indexing scheme and
the face-centred shortest-translation family 1/2<110>.  The lattice ratio
does not enter the integer zone law g.b = hu + kv + lw, so the reference
table contains the exact integer products.  User-entered c/a is applied
later when indices are converted to Cartesian vectors for trace analysis.

Run from the repository root with::

    PYTHONPATH=backend python backend/crystallography/generate_fct_database.py
"""

from __future__ import annotations

import json
from itertools import product
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent / "data"
FRONTEND_DATA_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data"
FILENAME = "FCT_Face_Centered_Tetragonal.json"

# Both signs are retained to match the conventions used by the existing FCC
# g.b table and to let the UI display the full crystallographic family.
BURGERS_VECTORS = (
    (1, 1, 0),
    (1, 0, 1),
    (0, 1, 1),
    (-1, 1, 0),
    (-1, 0, 1),
    (0, -1, 1),
    (1, -1, 0),
    (1, 0, -1),
    (0, 1, -1),
    (-1, -1, 0),
    (-1, 0, -1),
    (0, -1, -1),
)


def _compact_label(vector: tuple[int, int, int]) -> str:
    return "".join(str(component) for component in vector)


def build_dataset() -> dict:
    g_vectors = [g for g in product(range(-3, 4), repeat=3) if any(g)]
    return {
        "name": "(FCT) Face-Centered Tetragonal",
        "crystal_system": "tetragonal",
        "centering": "F",
        "index_notation": "hkl",
        "burgers_vector_family": "1/2<110>",
        "g_vectors": [" ".join(str(component) for component in g) for g in g_vectors],
        "b_vectors": [_compact_label(b) for b in BURGERS_VECTORS],
        "values": [
            [sum(g_i * b_i for g_i, b_i in zip(g, b)) for b in BURGERS_VECTORS]
            for g in g_vectors
        ],
    }


def main() -> None:
    payload = json.dumps(build_dataset(), indent=2) + "\n"
    for directory in (DATA_DIR, FRONTEND_DATA_DIR):
        directory.mkdir(parents=True, exist_ok=True)
        (directory / FILENAME).write_text(payload, encoding="utf-8")


if __name__ == "__main__":
    main()
