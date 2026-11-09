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
- [x] 3.3 Hexagon twist gadget — test: every vertex satisfies Kawasaki
  - `core/gadgets/hexagon-twist.ts`: `hexagonTwistCreases(s, R)`, `hexagonTwist(s, R)`, type `Crease`
  - Corners Pₖ = s·uᵏ (u = 1 + ω); radial ray Rₖ (M) along uᵏ and extension ray Xₖ (V) along uᵏ⁺¹; hexagon edges M
  - Sectors 2π/3, 2π/3, π/3, π/3 at each corner, so Kawasaki holds for every s; 3 M + 1 V gives Maekawa
  - A "B" frame ring at hexDistance R (all 6R lattice points) makes the six corners interior; without it the validators pass vacuously
  - `fromSegments` now accepts a per-segment `assignment`; a conflicting duplicate throws
- [x] 3.4 Big-Little-Big check — test: known-valid pass, known-invalid fail, brute-force fold agrees
  - `core/validate/big-little-big.ts`: `bigLittleBigFlat(directions, assignments)`; sector sizes compared exactly with `compareAngle` on `d(i+1)·conj(d(i))`
  - Rule: for a maximal run of k equal sectors strictly smaller than both neighbours, the k + 1 creases bounding the run must not all agree (k = 1 is the lemma: the two creases differ). Necessary only
  - `checkLocalFlatFoldability` now also returns `bigLittleBig`: Kawasaki-passing, fully assigned interior vertices that fail it
  - Cross-checked against a brute-force layer-order search for every degree-4 and degree-6 vertex from the 30° directions: necessary at both degrees, exact at degree 4
- [x] 3.5 Triangle twist gadget — test: Kawasaki, Maekawa and Big-Little-Big hold at every interior vertex
  - `core/gadgets/triangle-twist.ts`: `triangleTwistCreases(n, m)`, `triangleTwist(n, m)`; `Crease` and `scale` moved to `core/gadgets/crease.ts` (shared with the hexagon twist)
  - Corners P₀ = 0, P₁ = n, P₂ = n·u, triangle edges M; at P₁ an M ray along +1 and a V ray along ω̄ = −1 − ω, each of length m; the other corners follow by the exact 120° rotation ρ(z) = ωz + n
  - Sectors 2π/3, π/3, π/3, 2π/3 at each corner (Kawasaki for every n, m); 3 M + 1 V, and the lone V is on a crease bounding the two small sectors, so Big-Little-Big holds
  - Closed by a concentric triangular "B" frame of side n + 3m, with corners −m(2+ω), n + m(1−ω) and their rotation, listed as unit edges so every ray ends on a frame point
  - Negative control: swapping M/V on every ray keeps Kawasaki and Maekawa but fails Big-Little-Big at all three corners
- [x] 3.6 Star twist gadget — test: Kawasaki, Maekawa and Big-Little-Big hold at every interior vertex
  - `core/gadgets/star-twist.ts`: `starTwistCreases(s)`, `starTwist(s)`; `rotate` and `hexagonFrame` moved to `core/gadgets/crease.ts`
  - No reference photos exist in the repo, so this is a spoked hexagram defined from first principles: a collapsed star, not a rotating twist
  - Vertices O = 0, Pₖ = s·uᵏ, Tₖ = Pₖ + Pₖ₊₁ (tips), Qₖ = 2s·uᵏ; 48 creases of length s (8 per k) inside a "B" frame at radius 3s
  - The inner hexagon edges are not creased (they break Kawasaki at Pₖ), and keeping both halves of the outer hexagon at each tip also breaks it (sectors π/3, π/3, π/3, π); gₖ is continued straight through the tip instead
  - The crease set was found by an exhaustive search of 6-fold symmetric crease sets on the radius-3 grid (8 pass Kawasaki); the sparsest was used
  - M/V: aₖ = bₖ = pₖ (M, V, V repeating), eₖ = V, gₖ = M, hₖ = xₖ = y±ₖ = ¬pₖ₊₁; the centre is 2 M / 4 V, so the assignment is only half-turn symmetric
  - Frame radius is fixed at 3s because xₖ and y⁺ₖ meet on the frame there; a larger frame makes them cross
  - Negative controls: swapping the b, e, h creases fails Big-Little-Big only (6 vertices); swapping the spokes fails Maekawa at the six Pₖ
- [x] 3.7 Phase 3 audit (`audit/phase-3`): debug and test Phases 1 to 3 per the `CLAUDE.md` "Phase audits" section
  - Nested components were never validated: `CreasePattern` gains `holes` (outer walks of components nested in a bounded face, by exact `windingNumber`), and `interiorVertices` counts them
  - A vertex with only "F" creases no longer fails Kawasaki and Maekawa; `rotate` handles negative and rejects non-integer k; `hexagonFrame` rejects radius < 1
  - `primitive`/`gcd` moved to `core/lattice/direction.ts` and used by Big-Little-Big too, so it no longer overflows where Kawasaki does not
  - `triangleTwistCreases` listed each triangle edge twice (P₁P₀ and P₀P₁); each now appears once
  - New tests: flood-fill brute force for `faceCount` and `interiorVertices`, `windingNumber` against ray casting, `compareAngle` as a total preorder, and `gadgets.test.ts` (clean report, documented interior vertices, float sector sum, render) for all three gadgets
  - Stale comments fixed; snapshots re-inspected as images

## Phase 4: Mountain/valley solver
- [x] 4.1 Local M/V constraints as Boolean clauses
  - `core/solve/clauses.ts`: `localMvClauses(cp)`, `vertexClauses`, `violatedClauses`, `satisfies`, `assignmentFromPattern`
  - DIMACS variables: edge e is variable e + 1, positive = M. M/V creases already set get a unit clause; "U" creases are free; "B"/"F" never appear
  - Maekawa by enumeration: one blocking clause per assignment outside #M ∈ {n/2 ± 1} (2ⁿ − 2·C(n, n/2+1)); odd degree gives the empty clause; degree above `MAX_ENCODED_DEGREE` = 12 throws
  - Big-Little-Big: per run from the new `smallSectorRuns`, "not all equal" as two clauses, only at vertices that pass Kawasaki. Kawasaki is geometric, so failing vertices are returned in `formula.kawasaki`
  - `foldingCreases(cp, v)` is shared by the validator and the encoder
  - Test: exhaustive over every Kawasaki vertex of degree 4 and 6 from the 30° directions, clauses accept exactly `maekawaFlat && bigLittleBigFlat`; gadgets agree with `checkLocalFlatFoldability` on perturbed assignments; the three gadget negative controls violate the expected clause kinds
- [x] 4.2 SAT/backtracking solver — test: Maekawa holds at every vertex
  - `core/solve/solver.ts`: `solveFormula`, `solveMv(cp)`, `mvSolutions` (lazy, all solutions via blocking clauses), `withMvAssignment(cp, assignment)`
  - DPLL with unit propagation and an explicit backtracking stack; branches valley first, so results are deterministic. A formula with Kawasaki failures returns `kawasaki` without searching
  - `unsat` names the vertices on the propagation chain when the conflict needs no branching, otherwise `vertices: []`; it is not a minimal core
  - Test: each gadget with every M/V crease reset to "U" is solved and passes `checkLocalFlatFoldability` cleanly; sat/unsat agrees with brute force on random freed/flipped creases; `mvSolutions` count equals brute force
- [x] 4.3 Phase 4 audit (`audit/phase-4`): debug and test Phases 1 to 4 per the `CLAUDE.md` "Phase audits" section
  - `solveFormula` and `mvSolutions` now reject malformed formulas (zero, fractional or out-of-range literals, bad `variableCount`) with `RangeError`; before, such a literal read `undefined` and a hand-built clause like `[0]` was "satisfied"
  - `withMvAssignment` returns a frozen pattern with frozen edges, like `creasePattern`
  - `vitest.config.ts` sets `testTimeout: 30_000` for the load-sensitive property tests
  - New tests: DPLL and `mvSolutions` against brute force on random CNF; random line arrangements (all Kawasaki) checked against `checkLocalFlatFoldability` as an independent oracle, covering both sat and unsat; determinism; degree 0 and degree 2 clauses

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
