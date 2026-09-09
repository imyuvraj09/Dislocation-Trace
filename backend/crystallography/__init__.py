"""
backend/crystallography/
=========================
Dedicated crystallography reference service, ported/reused from the
`g.b` (crystal-gb-explorer) project's databases and math utilities.

This package is CrystalTrace's single source of truth for crystallographic
reference data (crystal-structure Burgers-vector families, reflection
lists) and the one place that math for resolving a Burgers vector from
experimental g.b observations lives. No other module -- frontend or
backend -- should read `data/*.json` directly; everything goes through
`queries.py` (which is backed by `loader.py`'s cached, load-once dataset
registry).

Modules
-------
models.py       Typed dataclasses shared by every other module here.
loader.py       Loads + normalizes `data/*.json` once, caches in memory.
vector_math.py  Ported from g.b's math/vector.js.
matrix_math.py  Ported from g.b's math/matrix.js (RREF / null space).
solver.py       Ported from g.b's math/solver.js (BurgersSolver.solve) --
                candidate Burgers-vector determination from experimental
                g.b observations.
queries.py      The public API every router/service should call.
"""
