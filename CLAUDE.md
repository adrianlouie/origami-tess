# Origami tessellation designer

Math-driven generator for flat-foldable origami tessellations (uncut paper only,
triangular-lattice twist folds as the target style). No AI/ML. Users generate a
crease pattern from equations and symmetry, view it folded in 3D, and export it.

Status and next steps live in `docs/PLAN.md` and `docs/HANDOFF.md`, not here. Ideas drawn from the reference book (Lang, *Twists, Tilings, and Tessellations*) live in `docs/BOOK_IMPROVEMENTS.md`.

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
  - `generate/`: parameter sweeps and generators over gadgets and the solver (Phase 8)
- `app/`: viewer and export. Depends on `core/`, never the reverse.
- Data flow: lattice → symmetry/gadgets → pattern → validate → solve → simulate/render.

## Conventions
- Lattice math uses exact integers (Eisenstein), never floats. Floats only at the
  render boundary and in `core/simulate/` (the physical stage, after every exact stage; its
  `embed.ts` is where lattice points first become floats). Any tolerance lives in one shared
  constant, `RENDER_TOLERANCE` in `core/simulate/embed.ts`.
- `core/` functions are pure; the pattern graph is treated as immutable.
- Every math function has a test, and its docstring cites the theorem or formula it implements.
- Prefer property-based tests for invariants (e.g. every generated vertex satisfies Kawasaki).
- Terms: crease pattern (CP), mountain/valley (M/V), gadget (reusable twist unit), motif (tile seed). More in `docs/GLOSSARY.md`.

## Comments and documentation
- Every module opens with a header comment: its purpose and where it sits in the data flow.
- Every exported function, class and type gets a TSDoc `/** */` comment: a one-line summary,
  then `@param` / `@returns` where the meaning is not obvious from the name and type.
- Math code states its source in the TSDoc: name the theorem or formula, define each symbol,
  give units (angles in radians), and cite the reference.
- Comment the why, not the what: invariants, why exact integers are used, why a tolerance is
  needed, why a case is handled. Do not narrate code that reads clearly on its own.
- Keep comments true: update or delete them in the same PR that changes the behavior.
  No commented-out code. A `TODO` must name the plan step it belongs to (e.g. `TODO(5.2)`).
- Tests are named for the property they check, with the theorem cited when one applies.

## Commands
- `npm test`: unit and property tests
- `npm run typecheck` · `npm run lint` · `npm run format:check` (`npm run format` fixes)

## Phase audits
- After the last step of every phase is merged, run a debug and test audit before starting the
  next phase. It covers the finished phase and every phase before it.
- Run `npm test`, `npm run typecheck` and `npm run lint`, and fix every failure and warning.
- Review each module in scope for bugs: edge cases (empty input, zero, negative, boundary
  values), exact-integer overflow past 2⁵³, and agreement between each function and the theorem
  its TSDoc cites.
- Strengthen tests where they are thin: add property-based tests for invariants, cross-check
  against a brute-force reference where one is feasible, and check that snapshots still look
  right by eye, not only that they match.
- Check that the interfaces between phases still hold (for example, that `tile` output renders
  and that gadget output satisfies the validators), and that comments and docs are still true.
- Record the findings and fixes in `docs/HANDOFF.md`. Land the fixes as their own PR named for
  the audit (for example `audit/phase-2`), separate from plan-step PRs.

## Planning after a merge
- Every time you merge a PR, ask the user whether to make a detailed plan for the next step
  before any code is written (use plan mode). A written plan gives better output than coding
  straight from the one-line entry in `docs/PLAN.md`.
- Ask once per merge, right after reporting the merge. Do not start the plan or the code until
  the user says yes. If they decline, continue with the usual restate-and-confirm flow.

## Git
- One plan step per branch and per PR; squash merge; CI must pass.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions.
