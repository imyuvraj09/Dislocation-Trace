# Cubic, tetragonal, and HCP trace workflows

## Design rule

Miller indices are coordinate labels, not Cartesian vector components except
in the cubic special case. The application therefore converts crystallographic
directions and plane normals to Cartesian coordinates before normalization,
dot products, cross products, linear solves, and angular comparisons.

The shared calculation stages remain unchanged in purpose:

1. Read the selected crystal system and its lattice ratio where required.
2. Validate the selected index notation.
3. Convert directions with the direct-lattice basis and planes with the
   reciprocal-lattice basis.
4. Perform trace reconstruction in Cartesian coordinates.
5. Convert the reconstructed direction and slip-plane normal back to the
   notation of the selected crystal system.

## Cubic

- Directions: `[u v w]`
- Planes: `(h k l)`
- Direct basis: identity
- Reciprocal basis: identity
- `c/a`: not requested

This is the default path. Existing cubic inputs and numerical results are
preserved.

## Tetragonal

- Directions: `[u v w]`
- Planes: `(h k l)`
- Direct basis, with `a = 1`: `diag(1, 1, c/a)`
- Reciprocal basis: `diag(1, 1, a/c)`
- `c/a`: finite positive user input

Direction and plane indices remain three-index, but their Cartesian
conversions differ because direct and reciprocal c-axis scaling are inverse.

## HCP

- Directions: Miller--Bravais `[u v t w]`, with `t = -(u + v)`
- Planes: Miller--Bravais `(h k i l)`, with `i = -(h + k)`
- Direct basis, with `a = 1`: `a1 = (1, 0, 0)`,
  `a2 = (-1/2, sqrt(3)/2, 0)`, and `c = (0, 0, c/a)`
- Plane normals use the reciprocal basis
- `c/a`: finite positive user input

The HCP database and Burgers-vector finder use four indices. The conversion
service removes the redundant index only internally, performs all calculations
in three-component Cartesian space, and restores valid four-index output for
true line directions and slip planes.

## Active databases

Only database entries backed by implemented workflows are active: FCC, BCC,
B2, simple cubic, simple tetragonal, BCT, FCT, and HCP. Unsupported entries are not
listed in the crystal-structure selector and are not available in the common
Burgers-vector finder.
