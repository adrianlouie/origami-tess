# Plan


Each step is sized to one PR. Write the acceptance test before the code. Check a box only when the PR is merged.

## Decisions
- [x] Language: **TypeScript** for `core/` and `app/` (decided 2026-11-07). Vitest and fast-check for tests.
  - Python is an optional scratchpad only: `sympy` notebooks to derive equations, never shipped.
  - Rust→WASM is a later option for the Phase 5 layer solver, only if it proves too slow.
- [x] GitHub repo: private [origami-tess](https://github.com/adrianlouie/origami-tess), local at `~/origami-tess` (created 2026-11-07, initial commit only)
- [x] PR descriptions carry no "Generated with Claude Code" footer (decided 2026-11-07)

## Phase 0: Repo setup
- [x] 0.1 Scaffold repo (TypeScript, Vitest, fast-check), CLAUDE.md, docs/PLAN.md, docs/HANDOFF.md
- [x] 0.2 CI (typecheck, lint, tests) and PR template
- [x] 0.3 `/handoff` and `/next-step` commands

## Phase 1: Lattice
- [x] 1.1 Eisenstein integer type (add, mul, rotate 60°) — test: rot60⁶ = identity
- [x] 1.2 Triangular grid generator — test: edge count for radius R
- [x] 1.3 SVG renderer — test: snapshot of R=3 grid

## Phase 2: Symmetry
- [x] 2.1 Affine transform and group type — test: group axioms hold
- [x] 2.2 p6m generators and orbit tiling — test: orbit closed under the group
- [x] 2.3 Motif + group → tiled render — test: snapshot of a p6m(2+ω) tiling at R=3
  - `Motif = { points, edges }` (core/symmetry/motif.ts); edges reuse `Edge` from grid.ts
  - `tile(group, motif, R)` in orbit.ts shares the window enumeration with `orbit`; an edge is kept when both ends lie within R
  - `tilingToSvg` in app/render/svg.ts; `gridToSvg` output is unchanged
  - Properties: closure under the group, matches brute force, circle count = |orbit|, all inside the viewBox
  - Use a period other than 1 in examples (under p6m(1) every orbit fills the lattice)
- [x] 2.4 Phase 2 audit (`audit/phase-2`): debug and test Phases 1 and 2 per the `CLAUDE.md` "Phase audits" section
  - Checked integer arithmetic (`checkedMul`/`checkedAdd`) so overflow past 2⁵³ throws instead of rounding
  - `rotation60`, `inLattice`, SVG options and zero-length motif edges are validated
  - `svgDocument` no longer spreads large arrays; new edge-case, BFS and tile→render property tests
  - Prettier enforced: `format:check` in CI

## Phase 3: Gadgets and validation
- [x] 3.1 Crease graph data structure — test: Euler relation on faces
  - `core/lattice/direction.ts`: exact `cross`, `compareAngle`, `orientation`, `onSegment` (no `atan2`)
  - `core/pattern/crease-pattern.ts`: `creasePattern`, `fromSegments`, `faceCount`, `componentCount`, `faceDoubledArea`
  - Faces by half-edge traversal; a walk with positive doubled area is bounded, so F = bounded + 1 and V − E + F = 1 + C
  - Planarity is enforced (crossings, T-junctions, duplicates throw RangeError), not repaired
  - Assignments follow FOLD: `M | V | B | F | U`, default `U`
- [x] 3.2 Kawasaki and Maekawa validators — test: known-valid pass, known-invalid fail
  - `core/validate/local-flat-foldability.ts`: `kawasakiFlat`, `maekawaFlat`, `interiorVertices`, `checkLocalFlatFoldability`
  - Kawasaki is exact: the odd sector sum is arg Q with Q = Π d₂ₖ·conj(d₂ₖ₋₁), and it equals π iff Q is a negative real (`b === 0 && a < 0`)
  - Only interior vertices are checked (no border edge, every sector in a bounded face); "F" creases are ignored; vertices with a "U" crease are reported as `unassigned`, not failed
- [ ] 3.3 Hexagon twist gadget — test: every vertex satisfies Kawasaki
- [ ] 3.4 Triangle twist and star twist gadgets
- [ ] 3.5 Big-Little-Big check

## Phase 4: Mountain/valley solver
- [ ] 4.1 Local M/V constraints as Boolean clauses
- [ ] 4.2 SAT/backtracking solver — test: Maekawa holds at every vertex

## Phase 5: Layer ordering
- [ ] 5.1 Face adjacency and stacking constraints (taco-taco, taco-tortilla, tortilla-tortilla)
- [ ] 5.2 Layer solver — test: known flat-foldable patterns yield a valid order
- [ ] 5.3 Flat-folded layered render

## Phase 6: 3D viewer
- [ ] 6.1 Three.js scene with orbit/zoom/pan
- [ ] 6.2 Bar-and-hinge fold simulation with fold-percentage slider

## Phase 7: Export
- [ ] 7.1 SVG/PDF with M/V line styles
- [ ] 7.2 Guided pre-crease then collapse step list

## Phase 8: Generative math
- [ ] 8.1 Parameter sweeps (twist angle, n)
- [ ] 8.2 Random motif + symmetry + solver repair
- [ ] 8.3 Cellular-automaton growth on the lattice

## Optional side modules
- [ ] Miura-ori closed-form generator and rigid fold
- [ ] Yoshimura, waterbomb, Resch

## Known risks
- Layer ordering is NP-hard in general; structured tessellations should be tractable. If the TypeScript solver is too slow, port that module to Rust→WASM.
- Twist folds are not rigid-foldable, so the 3D animation is approximate; the flat-folded render is the accurate one.
- Matching the style of the reference photos is realistic; matching them exactly is a stretch goal.
