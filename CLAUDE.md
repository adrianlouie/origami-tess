# Origami tessellation designer

Math-driven generator for flat-foldable origami tessellations (uncut paper only,
triangular-lattice twist folds as the target style). No AI/ML. Users generate a
crease pattern from equations and symmetry, view it folded in 3D, and export it.

Status and next steps live in `docs/PLAN.md` and `docs/HANDOFF.md`, not here.

## Stack
- TypeScript throughout. Vitest + fast-check for tests. Three.js for 3D, SVG for 2D.
- Python is only an optional scratchpad (sympy) for deriving equations; it is never shipped.

## Architecture
- `core/`: pure math library. No UI or DOM imports.
  - `lattice/`: Eisenstein-integer triangular grid
  - `symmetry/`: wallpaper groups (p6m first), orbit tiling
  - `gadgets/`: twist folds and pleats (hexagon, triangle, star)
  - `pattern/`: crease graph (vertices, edges, faces, M/V assignment)
  - `validate/`: Kawasaki, Maekawa, Big-Little-Big
  - `solve/`: M/V assignment and layer ordering (SAT/constraint search)
  - `simulate/`: fold kinematics, bar-and-hinge
- `app/`: viewer and export. Depends on `core/`, never the reverse.
- Data flow: lattice → symmetry/gadgets → pattern → validate → solve → simulate/render.

## Conventions
- Lattice math uses exact integers (Eisenstein), never floats. Floats only at the
  render boundary. Any tolerance lives in one shared constant.
- `core/` functions are pure; the pattern graph is treated as immutable.
- Every math function has a test, and its docstring cites the theorem or formula it implements.
- Prefer property-based tests for invariants (e.g. every generated vertex satisfies Kawasaki).
- Terms: crease pattern (CP), mountain/valley (M/V), gadget (reusable twist unit), motif (tile seed).

## Commands
- `npm test`: unit and property tests
- `npm run typecheck` · `npm run lint`

## Git
- One plan step per branch and per PR; squash merge; CI must pass.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions.
