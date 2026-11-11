# Plan


Each step is sized to one PR. Write the acceptance test before the code. Check a box only when the PR is merged.

## Decisions
- [x] Language: **TypeScript** for `core/` and `app/` (decided 2026-11-07). Vitest and fast-check for tests.
  - Python is an optional scratchpad only: `sympy` notebooks to derive equations, never shipped.
  - Rust→WASM is a later option for the Phase 5 layer solver, only if it proves too slow.
- [x] GitHub repo: private [origami-tess](https://github.com/adrianlouie/origami-tess), local at `~/origami-tess` (created 2026-11-07, initial commit only)
- [x] PR descriptions carry no "Generated with Claude Code" footer (decided 2026-11-07)
- [x] Partial foldability is a supported design outcome (decided 2026-11-09). Many good tessellations collapse except for a little at the end, so gadgets and generated patterns report a `nearFoldability` score and a localized conflict, not only pass or fail. A gadget may ship in a fully foldable and a partly foldable variant; the partly foldable one is a worked example, not a defect

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
  - Found in 5.1b: locally valid but does **not** fold flat for n < 3m; 5.2b restricts the gadget to n ≥ 3m
- [x] 3.6 Star twist gadget — test: Kawasaki, Maekawa and Big-Little-Big hold at every interior vertex
  - `core/gadgets/star-twist.ts`: `starTwistCreases(s)`, `starTwist(s)`; `rotate` and `hexagonFrame` moved to `core/gadgets/crease.ts`
  - No reference photos exist in the repo, so this is a spoked hexagram defined from first principles: a collapsed star, not a rotating twist
  - Vertices O = 0, Pₖ = s·uᵏ, Tₖ = Pₖ + Pₖ₊₁ (tips), Qₖ = 2s·uᵏ; 48 creases of length s (8 per k) inside a "B" frame at radius 3s
  - The inner hexagon edges are not creased (they break Kawasaki at Pₖ), and keeping both halves of the outer hexagon at each tip also breaks it (sectors π/3, π/3, π/3, π); gₖ is continued straight through the tip instead
  - The crease set was found by an exhaustive search of 6-fold symmetric crease sets on the radius-3 grid (8 pass Kawasaki); the sparsest was used
  - M/V: aₖ = bₖ = pₖ (M, V, V repeating), eₖ = V, gₖ = M, hₖ = xₖ = y±ₖ = ¬pₖ₊₁; the centre is 2 M / 4 V, so the assignment is only half-turn symmetric
  - Frame radius is fixed at 3s because xₖ and y⁺ₖ meet on the frame there; a larger frame makes them cross
  - Negative controls: swapping the b, e, h creases fails Big-Little-Big only (6 vertices); swapping the spokes fails Maekawa at the six Pₖ
  - Found in 5.1b: `starTwist(1)` is locally valid but does **not** fold flat (see 5.2c)
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
- [x] 5.1a Fold maps, face adjacency and overlap (5.1 split in two; this is the geometry half)
  - `core/pattern/faces.ts`: `faceAdjacency(cp)` lists creases with a bounded face on each side (`left` of v0→v1, `right`); a crease with the same face on both sides (dangling) throws
  - `core/solve/folded-faces.ts`: `creaseReflection(p, d)` and `foldFaces(cp)`. Reflection z ↦ p + (d/d̄)·conj(z − p) is an integer `Affine` only for directions on a lattice mirror axis (multiples of 30°); any other direction throws
  - `foldFaces`: BFS over the adjacency graph, F_b = F_a ∘ ρ_e across M/V, F_b = F_a across F, "B" not crossed. A non-tree crease that disagrees returns `{status: "inconsistent", edges}`; "U" creases and faces with holes throw
  - `core/solve/overlap.ts`: `triangulateFace` (ear clipping, collinear vertices dropped first), `trianglesOverlap` (exact separating-axis test), `overlappingFacePairs(cp, transforms)`
  - Test: for spokes at multiples of 30° in a radius-2 frame, `foldFaces` is "ok" exactly when `kawasakiFlat` holds (all 2497 subsets of 2 to 6 spokes); gadgets fold consistently and agree on every crease; overlap matches an independent unit-triangle brute force, and `trianglesOverlap` matches a float clipping area
- [x] 5.1b Stacking constraints as clauses (taco-taco, taco-tortilla, tortilla-tortilla, transitivity) — test: clauses satisfiable exactly when the single-vertex `foldsFlat` oracle says the vertex folds
  - `core/solve/stacking.ts`: `stackingClauses(cp, folded)` returns `{variableCount, pairs, clauses}`; pair k = [i, j] (i < j, from `overlappingFacePairs`) is variable k + 1, true = "face i above face j". `aboveLiteral(formula, p, q)` looks a pair up
  - Six clause kinds, each tagged with its source: `crease` (M/V fixes the order: the right face is above iff V XOR the left face is flipped), `taco-taco`, `taco-tortilla`, `tortilla-tortilla`, `crossing` (a face whose interior contains a crease is above both of its faces or below both) and `transitivity` (only for triples with a common interior point; a pairwise-overlapping ring may be stacked cyclically)
  - `core/solve/overlap.ts` gains exact helpers: `foldedTriangles`, `overlapPairsOf`, `segmentsOverlapCollinear`, `sameDirection`, `segmentCrossesFace` (a segment along a triangulation diagonal counts as crossing), `trianglesShareInterior` (BigInt half-plane intersection)
  - `core/solve/solver.ts` exports `solveClauses(variableCount, clauses)`, the plain-CNF entry point 5.2 will use
  - The brute-force oracle moved to `core/validate/testing.ts` (`foldsFlat`, `layerOrderValid`, `candidates`, …)
  - Test (single vertex): every Kawasaki vertex of degree 4 (all M/V strings) and degree 6 (all Maekawa strings plus a sample) agrees with `foldsFlat`; at degree 4 every layer order is accepted exactly when `layerOrderValid` is (this pins the M/V convention); F spokes added to degree-2 and degree-4 vertices must not change the answer
  - Test (whole pattern): `core/solve/layer-oracle.ts` (test-only) decides foldability of a convex-faced pattern by sampling the folded paper on both sides of every crease line (float point-in-polygon), then searching the pair relations depth-first. It is checked against `foldsFlat` on every single vertex, and against the formula on lattice-line arrangements, on every locally valid M/V assignment of the triangle twists, and on 150 to 400 random face subsets per gadget (the clauses inside a face set must be exactly as satisfiable as the oracle's constraints inside it)
  - Mutation check: each of the six clause kinds, the crease orientation, the common-point rule of transitivity, the diagonal rule of `segmentCrossesFace` and the opposite-side rule of taco-taco was broken in turn, and a test failed every time
  - **Finding: the shipped triangle twist and star twist do not fold flat.** `triangleTwist` (1,1), (2,1) and (1,3) and `starTwist(1)` are unsatisfiable, and the oracle agrees; the hexagon twists (1,2) and (2,3) are satisfiable. Phase 3 only proved them locally valid. For the triangle twist other locally valid M/V assignments of the same creases do fold (12 of 26 for (1,1), 24 of 26 for (2,1)), so only the assignment is wrong. The star twist has a 5-face conflict (faces 0, 4, 5, 9, 12 of `starTwist(1)`) and none of 150 sampled locally valid assignments fold, so its crease set likely needs redesign
- [x] 5.2 Layer solver — test: known flat-foldable patterns yield a valid order
  - `core/solve/layer-order.ts`: `layerOrder(cp)`, `layerOrderOf(cp, folded)`, `stackFaces`, `orderFromRelation`, `isAbove`. A model of `stackingClauses` becomes `above[k]` per pair, then a list of faces from the top down (Kahn's sort, smallest index first, so deterministic)
  - The clauses enforce transitivity only where three faces share a point, so a model can contain a cycle. `stackFaces` blocks the cycle with one clause and solves again (at most `MAX_CYCLE_ROUNDS` = 1000); if every model is cyclic the first model is returned with `order: null`
  - **Finding: the hexagon twists (1,2) and (2,3) fold but have no global linear order.** Six faces (1, 3, 4, 6, 8, 10) in a ring around the twist are stacked cyclically in every valid model; after blocking that ring the formula is unsatisfiable. The pleats weave, so the layered render (5.3) must order faces region by region, not with one list
  - Independent check: `oracleBrokenRules` in `core/solve/layer-oracle.ts` (test-only) evaluates the oracle's float-sampled physical rules on a given relation and names the broken ones. The oracle's bitmask is now a boolean array (the 32-bit mask would alias past 31 pairs; the hexagon twists have 30)
  - Test: hexagon twists pass the oracle; shipped triangle twists are `unfoldable`; over every locally valid triangle-twist (1,1) and (2,1) assignment `ok` matches the oracle and each order is a linear extension that passes it; lattice-line arrangements; every degree-4 single vertex agrees with `foldsFlat` and the order passes `layerOrderValid`; a flipped pair is caught; `stackFaces` on synthetic formulas (mutation-tested: removing the blocking clause fails a test)
  - Profile: clauses plus solve take 2 to 4 ms on the hexagon twists and 65 to 72 ms on `starTwist(1)` (435 pairs, 9,884 clauses), so no optimisation was needed
- [x] 5.2b Make the triangle twist fold flat — test: `stackingClauses` is satisfiable and `layerOracle` agrees
  - **The M/V assignment was not the bug.** With threefold symmetry, Big-Little-Big leaves only the shipped assignment and its global flip. It folds exactly when n ≥ 3m (swept over n ≤ 12, m ≤ 4: n = 3m − 1 fails, 3m folds). Below that the pleats collide
  - `triangleTwist(n, m)` now throws `RangeError` when n < 3m; `triangleTwistCreases` still lists the raw creases for any size, and `rawTriangleTwist` (`core/solve/testing.ts`) wraps them as the locally-valid-but-unfoldable fixture
  - Where it folds the stacking is cyclic (`order: null`), like the hexagon twists
  - Rejected alternative: the asymmetric assignment `VVM MMM VVV` (per corner: triangle edge, ray +, ray −) folds with a linear order at every size tested, but it is not threefold symmetric and so not a twist
  - Tests: acceptance at (3,1), (4,1), (6,2), (9,3); the n ≥ 3m sweep; the oracle agrees below the bound; existing tests moved to foldable sizes or to the raw fixture. Mutation check: loosening the guard fails the rejection test
- [x] 5.2d Near-foldability: conflict sets and a graded score — test: a pattern that fails to fold reports a minimal conflicting set, and removing it makes the clauses satisfiable
  - `core/solve/conflict.ts`: generic over tagged CNF (`TaggedCnf`): `minimalConflict` (deletion MUS over tags, then over clauses; Marques-Silva 2010) and `minimumRepair` (implicit hitting set; Davies & Bacchus 2011; fewest tags, then least weight, then lexicographic; falls back to a greedy upper bound with `exact: false` past `MAX_REPAIR_SIZE` = 12 or `MAX_CONFLICTS` = 200)
  - `core/solve/near-foldability.ts`: `nearFoldability(cp)` / `nearFoldabilityOf` return `ok` (score 1), or `partial` with `conflict` (faces, minimal clauses, creases named) and `repair` (faces, weighted by doubled area) and an exact `score` `{ num, den }`; `mvConflict(cp)` does the same per vertex for the M/V clauses (Kawasaki failures are reported as they are)
  - A tag is a face (stacking) or vertex (M/V); giving a tag up drops every clause that mentions it, so the score measures distance from folding, not a folding of the rest
  - **Findings.** Star twist (1): the 5.1b core (0, 4, 5, 9, 12) is not minimal, because face 9 can go, leaving 0, 4, 5, 12; the engine's first conflict is another minimal one (faces 20, 21, 23, 24, 27, creases 28, 33, 34, 39). The cheapest repair is 4 of 30 faces, score 50/54, in about 170 ms. Triangle twist below n = 3m: six faces around the centre conflict and one face is enough to give up
  - Minimal is not minimum: the engine returns one minimal conflict, not the smallest
  - Tests: minimality and exactness against brute force over every face set on the triangle twists and lattice-line arrangements; the generic engine against brute force on random tagged CNF; the physical layer oracle agrees the conflict is unfoldable and the repaired faces stack; mutation-checked (skipping a tag, greedy hitting set, no weight tie-break)
- [x] 5.2c Star twist as two variants: `full` folds flat, `partial` folds except for a small region — test: `nearFoldability(starTwist(1))` is `ok`, and `starTwist(1, "partial")` is `partial` with score 50/54
  - `starTwist(s, fold)` and `starTwistCreases(s, fold)` take `fold: "full" | "partial"` (type `StarFold`, default `full`); both share every crease position, vertex and face and differ only in the M/V assignment. Anything else throws `RangeError`
  - **Correction to 5.1b:** it sampled 150 assignments and found no fold, so it called the crease set likely in need of redesign. Searching the half-turn-symmetric locally valid assignments found 500 (capped; 5.4 s) of which 2 fold, and the crease set is unchanged. Turning a foldable star by 60° gives another, so at least 6 fold; the true count is not known
  - Tally of the 500 by `nearFoldability` score: ok 2, 52/54 54, 51/54 12, 50/54 139 (the old assignment), 49/54 17, 48/54 208, 47/54 11, 46/54 56, 45/54 1
  - `full` is the table `VVVMMMVV` / `MVMVMMVV` / `VMVMMMMV` per spoke k mod 3, in the order a, b, e, g, h, x, y⁺, y⁻. Found by search and not derived from a closed form. Half-turn symmetric (rows repeat every three spokes), not 120°-symmetric; two M and four V at the centre. It has a non-null layer order (unlike the hexagon and triangle twists), and `oracleBrokenRules` finds no broken physical rule in it. The oracle cannot decide the star outright (435 pairs against its limit of 26), so this checks the found stacking, not the whole question
  - `partial` is the old assignment, kept on purpose as the repo's example of a pattern that folds in part: giving up 4 of 30 faces, score 50/54. 5.3 can use it to draw the foldable part and mark the conflict
  - Not decided: a measure of how localized the conflict is (conflict faces as a share of area, or their distance from the centre). `nearFoldability` says the paper is partly foldable, not that it works in practice; the bar-and-hinge simulation (6.2) is the real test
  - Tests: acceptance for both variants; shared geometry; both variants pass the local checks; the table; a bad `fold` throws; mutation check (one table entry flipped fails 8 tests)
- [x] 5.2e Localized-conflict measure for partial folds — `conflictLocality(cp, faces)` says how deep a face set lies and in how many pieces
  - `core/solve/locality.ts`: `boundaryDepth(cp)` is the number of face-adjacency hops to a face with an outline crease (BFS, exact integers; uses the sheet's topology, not the "B" label). `conflictLocality` returns `size`, `maxDepth`, area-weighted `meanDepth` (exact fraction, null if some face is unreachable), `clusters` (connected pieces in the dual graph), `area` (share of the paper) and `atEdge` (`maxDepth` is 0). `NearFoldability` is unchanged; callers pass it `repair.faces` or `conflict.faces`
  - Decided with the user: edge depth, not distance from centre, and a profile rather than one combined score (the weighting would be arbitrary; 8.2 decides how to rank)
  - Star twist `partial`: repair faces {3, 4, 10, 20} are four separate unit-area pieces, each one hop inside the outline (max depth 1, mean 1, area 4/54, not at the edge). The minimal conflict {20, 21, 23, 24, 27} is one piece reaching two hops in (mean 7/9, area 9/54). So the star's missing fold is not an edge margin; it sits just inside the rim
  - Tests: acceptance values for the star; depth against a Floyd–Warshall reference, clusters against union-find, areas and means against direct sums (random face sets on five patterns); order and duplicate invariance; empty, single and full sets; bad index throws; mutation-checked (BFS seed, outline rule, cluster merging, area weighting)
- [x] 5.3 Flat-folded layered render — `layeredView(cp)` and `foldedToSvg(cp, view)` draw the folded paper with the right face visible everywhere, even where the stacking has no global order
  - `core/solve/layered-view.ts`: `layeredView` (from `nearFoldability`: the `layerOrderOf` model when `ok`; for `partial`, a model of the clauses without the repair faces via `stackWithout`), with `dropped`, `conflictCreases`, exact folded `outlines` and `triangles`. `facesAbove(view, f)` lists the faces over f. `topFaceAt(view, p)` is the exact visible face at a point `{a, b, d}` (lattice coordinates over a common denominator): the covering face that no other covering face is above. The covering faces of a point are totally ordered by the transitivity clauses, so this works when the whole relation has a ring
  - Covering is tested against the whole folded outline (off every edge, non-zero winding), not the triangles: a point on an internal ear-clipping diagonal is in no triangle's interior but is in the face. A first version used triangles and was wrong; the brute-force helper shared the blind spot, so the test helper now uses a different route (closed triangle, not on the outline)
  - `app/render/folded-svg.ts`: each kept face is a polygon under an SVG mask of the faces above it, so the visible regions are disjoint and drawing order is irrelevant (decided with the user over an exact cell arrangement or a transparent overlay). Flipped faces use the back colour. Dropped faces are red-hatched on top; conflict creases are red lines at their folded place. `svg.ts` now exports its helpers (`svgDocument`, `toPixels`, `fmt`, `checkOptions`, `Px`)
  - Tests: acceptance on both hexagon twists (ok, nothing dropped, `order` null, a top face at every sample point), the partial star (drops {3, 4, 10, 20}, conflict creases match `nearFoldability`, satisfiable without them and not with them); `topFaceAt` against brute force and the linear order; the SVG parsed back and compared with `topFaceAt` at float samples; a flipped `above` bit is caught; the diagonal regression; snapshots for the hexagon twist and the partial star. Checked by eye: the hexagon twist collapses to one hexagon (the central face is above all), the partial star shows the foldable part with the hatched pieces on top
- [x] 5.4 Phase 5 audit (`audit/phase-5`): debug and test Phases 1 to 5 per the `CLAUDE.md` "Phase audits" section
  - Baseline was green (509 tests, typecheck, lint, format); the audit found six small defects and thin tests, all fixed
  - `stackFaces` ran `MAX_CYCLE_ROUNDS + 1` blocking rounds against a documented 1000; now at most 1000 clauses, and the model after the last clause is still checked for an order (a first fix to `<` alone would have skipped it)
  - `minimumRepair` throws `RangeError` for a weight that is not a positive safe integer (zero or negative made giving up more tags look cheaper); `weightOf` and the `nearFoldability` area sums use `checkedAdd`
  - `foldedToSvg` found a conflict crease's face with `findIndex` (−1, then a TypeError); it now uses `faceAdjacency` and throws a `RangeError` for an edge between no two faces
  - `layeredView` reuses the `nearFoldability` formula through `stackFaces` instead of rebuilding it with `layerOrderOf`; `topFaceAt` doc made precise about outlines
  - New tests: property tests for `orderFromRelation` (against a DFS cycle detector) and `stackFaces` (against enumeration of every model), `topFaceAt` over arrangements and gadgets at random rational points, `nearFoldability` invariants (score, repair, conflict minimality) on unfoldable patterns, a round-limit test with a mocked solver, near-2⁵³ behaviour (a rhombus folds at side 2²⁵, `topFaceAt` throws `RangeError` when scaling overflows, construction throws at 2²⁶), and `core/pipeline.test.ts` running every gadget variant through validate, solve and render
  - Mutation-checked: removing the round cap, skipping the last model, and dropping the weight check each fail a test
  - Missing TSDoc added to four exports; snapshots viewed as images (no seams)

## Phase 6: 3D viewer
- [x] 6.1 Three.js scene with orbit/zoom/pan — the flat crease pattern as a paper sheet with M/V-coloured creases, and a camera that orbits, zooms and pans
  - `app/viewer/camera-rig.ts`: the camera as pure math (`Rig` = target, radius, azimuth, polar; +z up). `rigPose`, `orbit` (polar clamped to `POLAR_MIN`, so the screen never flips), `zoom` (clamped radius), `pan` (in screen axes, scaled by the radius), `fitRig` (the bounding sphere fits both view cones, so any orbit keeps the pattern in view), `clipPlanes`. No three import, so it is tested in Node
  - `app/viewer/sheet.ts`: `sheetGeometry(cp)` gives one position per crease-pattern vertex (same order, z = 0), triangle indices from `triangulateFace`, and crease index pairs per assignment. Faces with holes throw, as in `foldFaces`. `app/viewer/scene.ts`: `buildScene(cp)` (a "sheet" mesh and `creases-<A>` lines that all share one position attribute, so 6.2 can fold the sheet by updating that one buffer) and `applyRig`
  - `app/viewer/input.ts`: `pointerToRig` maps a left drag to orbit, a right or shift drag to pan (the pattern follows the pointer) and the wheel to zoom. `main.ts`, `gadgets.ts` and the root `index.html` are the Vite page (`npm run dev`, `npm run build`); `main.ts` is the only DOM code and redraws on events, with no animation loop
  - Decided with the user: our own rig, not three's `OrbitControls`, so the controls are testable without a browser; a flat sheet, not the folded layers (6.2 animates the sheet)
  - Tests: acceptance on every gadget variant (mesh area equals the sum of face areas, crease counts per assignment, every vertex in view after `fitRig` at three aspect ratios and after random orbits); rig properties (fast-check) for orbit, zoom, pan and `fitRig`; sheet edge cases; input conventions; `core/pipeline.test.ts` builds a scene for every gadget. Mutation-checked: removing the polar clamp, fitting only the vertical field of view, and panning on world axes each fail a test
  - Checked by eye in headless Chrome: the hexagon twist renders centred with red M, blue V and a dark border. Dragging was not exercised by hand (headless), only by the input tests
- [ ] 6.2 Bar-and-hinge fold simulation with fold-percentage slider

## Phase 7: Export
- [ ] 7.1 SVG/PDF with M/V line styles
- [ ] 7.2 Guided pre-crease then collapse step list

## Phase 8: Generative math
- [ ] 8.1 Parameter sweeps (twist angle, n)
- [ ] 8.2 Random motif + symmetry + solver repair (repair raises the `nearFoldability` score; a full fold is not required)
- [ ] 8.3 Cellular-automaton growth on the lattice

## Optional side modules
- [ ] Miura-ori closed-form generator and rigid fold
- [ ] Yoshimura, waterbomb, Resch

## Known risks
- Layer ordering is NP-hard in general; structured tessellations should be tractable. If the TypeScript solver is too slow, port that module to Rust→WASM.
- Passing the local validators (Kawasaki, Maekawa, Big-Little-Big) does not mean a pattern folds flat: two of the three gadgets passed them and still failed (the triangle twist below n = 3m, and the star twist in its `partial` variant). Run `stackingClauses` on every new gadget or generated pattern (8.2 especially).
- The whole-pattern test oracle (`core/solve/layer-oracle.ts`) covers convex faces and about 26 overlapping pairs; bigger or non-convex patterns are only checked on face subsets, so 5.2 needs its own independent order check.
- Twist folds are not rigid-foldable, so the 3D animation is approximate; the flat-folded render is the accurate one.
- Matching the style of the reference photos is realistic; matching them exactly is a stretch goal.
