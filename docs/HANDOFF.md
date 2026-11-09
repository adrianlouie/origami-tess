## Last session: 2026-11-08
Merged the Phase 4 audit (PR #23), then did step **5.1a** (branch `step/5-1a-fold-maps-and-overlap`): fold maps, face adjacency and folded-face overlap. Tests 313 → 350; typecheck, lint and `format:check` pass. I split 5.1 in two as the plan proposed; `PLAN.md` now has 5.1a (done) and 5.1b.

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has everything through the Phase 4 audit. Branch `step/5-1a-fold-maps-and-overlap` holds 5.1a.
- `.idea/` is excluded locally through `.git/info/exclude`, so the tree is otherwise clean.

## Next step
Merge the 5.1a PR (`/next-step`), then step **5.1b**: stacking constraints as clauses. Design is in "Step 5.1a notes" below. `CLAUDE.md` also says to ask whether you want a detailed plan before coding.

## Step 5.1a notes
- `foldFaces(cp)` returns `{status: "ok", transforms, flipped}` or `{status: "inconsistent", edges}`. `transforms[f]` is an exact `Affine` from the pattern to the folded plane; `flipped[f]` is det = −1. Each connected piece starts from the identity.
- Folded map across a crease: F_b = F_a ∘ ρ_e. For a single vertex, "ok" is exactly Kawasaki (product of reflections is the identity iff the alternating sector sum is 0); the exhaustive spoke test checks this, odd degrees included.
- `creaseReflection` needs d²/N(d) to be an Eisenstein integer, i.e. d on a mirror axis (multiples of 30°). All gadgets qualify. A random motif with another crease direction (8.2) will throw; a rational-coordinate extension would be needed.
- Faces with holes (nested components) and dangling creases throw. "B" creases are never crossed, even between two bounded faces.
- `overlappingFacePairs` triangulates each face (ear clipping after dropping collinear vertices), moves the triangles by the face's map and tests pairs with a separating-axis check (touching does not count). It is O(T²) with a bounding-box reject; fine for gadgets, revisit for large tilings.
- **Correction to my own test:** the first unit-triangle brute force used (a,b),(a+1,b),(a,b+1), which is a 120° triangle (0, 1, ω), not a lattice triangle. Unit triangles are (a,b),(a+1,b),(a+1,b+1) and (a,b),(a+1,b+1),(a,b+1). The solver output was right and the reference wrong; I only found out by looking at the folded triangles.
- For 5.1b: variables are one per overlapping pair (i < j, "i above j"); the mountain/valley rule is: across an M crease the neighbour goes below the face whose front side shows (flipped faces invert it), V is the reverse. This convention is not yet tested; pin it with the `foldsFlat` oracle in `big-little-big.test.ts`, which should move to a shared test helper. Clauses go in the `{variableCount, clauses}` shape of `MvFormula` so 5.2 can reuse `solveFormula`.
- `core/solve/testing.ts` holds the test-only spoke patterns (radius-2 frame, creases from the origin to the 12 ring points) and `subsetsOf`.

## Phase 4 audit findings (all fixed unless noted)
- **Malformed formulas were silently accepted.** The solver indexes its value table by |literal| − 1, so literal 0 or one beyond `variableCount` read `undefined`: a negative one counted as satisfied. `checkFormula` now throws `RangeError` from `solveFormula` and `mvSolutions` (the latter on the first `next()`).
- `withMvAssignment` returned unfrozen objects; it now freezes the pattern and its edges.
- `vertexClauses` at degree 0 gives the empty Maekawa clause (documented; `localMvClauses` never reaches it). Degree 2 allows only MM or VV (tested).
- The `orbit`/`star-twist` timeouts are fixed by `testTimeout: 30_000` in `vitest.config.ts`. Three parallel `npm test` runs all pass.
- Checked with no change needed: the Maekawa clause count 2ⁿ − 2·C(n, n/2+1), the Big-Little-Big "not all equal" pair, the DPLL reference, and the `unsat.vertices` caveat all match their TSDoc. The solver agrees with brute force on random CNF and with the validator on random line arrangements.
- Not changed, for Phase 5's larger tilings: gadget frames are walked in unit steps; `creasePattern` validation is O(V·E + E²); the solver rescans every clause each round (no watched literals); `mvSolutions` restarts from scratch per solution.

## Phase 3 audit findings (all fixed unless noted)
- **Nested components were skipped by the validators.** A component inside a bounded face has an outer walk with area ≤ 0, which was discarded, so its vertices never reached `visits === degree` and passed vacuously. `CreasePattern.holes[i]` now lists the outer walks nested directly in `faces[i]` (smallest containing face of another component, by `windingNumber`), and `interiorVertices` counts them. A nested tree's leaves are now flagged (odd degree).
- Vertices whose creases are all "F" failed Kawasaki and Maekawa (empty direction list); now skipped as trivially flat.
- `rotate(z, k)` returned z for negative k; it now reduces k mod 6 and throws for non-integers. `hexagonFrame` throws for radius < 1 (an empty ring made the validators vacuous).
- Big-Little-Big multiplied raw directions and could overflow where Kawasaki did not; both now use `primitive` (moved to `direction.ts`).
- `triangleTwistCreases` listed each triangle edge twice (it was merged by `fromSegments`, but would draw twice).
- Stale comments fixed (`crease-pattern.ts` assignment note, "two necessary conditions", step numbers below).
- Not changed: gadget frames are walked in unit steps, so a huge size hangs rather than throws. `creasePattern` validation is O(V·E + E²); revisit when Phase 4/5 use larger tilings.
- Snapshots (`grid-r3`, `tiling-p6m-r3`) were rendered to PNG and looked at: a radius-3 hexagonal grid and a six-fold rhombus tiling, both correct.

## Gotchas and decisions
- `/next-step` squash-merges the open PR (CI green only; stops if red, pending or ambiguous).
- Each step's own PR ticks its plan box. Write the handoff right after opening the PR and commit it to the same branch.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions. This overrides the default attribution reminder.
- Language is TypeScript. Python is only an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Lattice math uses exact integers (Eisenstein), not floats. Floats appear only in `app/render/`.
- Eisenstein uses `number`, not `bigint`. Arithmetic goes through `checkedMul`/`checkedAdd`, which throw RangeError rather than round past 2⁵³, so large inputs fail loudly. Small-coordinate property tests stay bounded for speed.
- Formatting: Prettier (`printWidth` 100) is enforced by `npm run format:check` in CI; `.prettierignore` skips Markdown, `docs/`, snapshots and the lockfile.
- `toCartesian` maps a + bω to (a − b/2, b√3/2). `gridToSvg` and `tilingToSvg` negate y, since SVG's y-axis points down.
- Rendered floats are written to 6 decimals (`RENDER_PRECISION`), and float comparisons use `RENDER_TOLERANCE` = 1e-5. That is the one shared tolerance.
- An `Affine` is z ↦ M·z + t with M a 2×2 integer matrix on (a, b) coordinates and det M = ±1, so inverses stay integral. `compose(f, g)` applies g first.
- p6m is πΛ ⋊ D6 with period π. `p6m(π)` throws unless πΛ is mirror-symmetric (π̄ ∈ πΛ). Valid examples: 1, 2, 1−ω, 2+ω (norm 3). Invalid: 3+ω (norm 7).
- `orbit` and `tile` share `windowElements`, which enumerates D6 and translations by a bound derived in its TSDoc. Both cut by the image's hex distance, so closure holds exactly. `tile` keeps an edge only when both ends are in the window; edges are undirected and deduplicated.
- A `Motif` is points plus edges; `Tiling` is the same type. Under `p6m(1)` every orbit fills the lattice, so examples use a larger period (the snapshot uses 2+ω).
- Mirror lines of D6 are at multiples of 30°; (2,1) lies on one, so use (3,1) for a generic point in tests.
- The brute-force test for `tile` expands by explicit translations, not `closure`, because the group is infinite and `closure` would throw.
- `cross(u, v) = ad − bc` has the exact sign of the Cartesian cross product (the √3/2 factor is positive). Angular order uses `halfPlane` then `cross`; no floats.
- `CreasePattern.faces` lists bounded faces only (outer boundary walks, counter-clockwise); the unbounded face is implicit, so `faceCount = faces.length + 1`. A component nested inside a face is listed in `holes` (3.7); `faces` still holds outer walks only.
- `rotation[i]` is vertex i's edge indices counter-clockwise from +x. Step 3.2 needs this: the sector angles between consecutive edges are what Kawasaki sums.
- `creasePattern` rejects non-planar input (crossings, a vertex inside an edge, duplicates, self-loops) instead of splitting edges. Splitting would be its own step.
- Half-edge h = 2e is v0→v1 and 2e + 1 is v1→v0, so the twin is `h ^ 1`.
- `noUncheckedIndexedAccess` is on, so array reads need `at(...)`, `?.` or `!`.
- `kawasakiFlat` takes directions in counter-clockwise cyclic order from any starting point (a shift swaps the odd and even sums, which are both π at a solution). It reduces to primitive vectors so products stay small; overflow still throws RangeError.
- `interiorVertices` counts a vertex's appearances in `cp.faces` walks and compares with its degree; a patch's outer ring is therefore never flagged. Vertices with a "B" edge are exempt.
- `checkLocalFlatFoldability` ignores "F" creases, runs Kawasaki on "U" creases too, and lists vertices with a "U" crease under `unassigned` instead of failing Maekawa. Both conditions are necessary only; Big-Little-Big is in `big-little-big.ts` (3.4).
- The Kawasaki float cross-check test imports `RENDER_TOLERANCE` from `app/` (test only); `core/` source never does.
- Big-Little-Big (`bigLittleBigFlat`): for a maximal run of equal sectors strictly smaller than both neighbours, the creases bounding the run must not all agree. With sectors 2π/3, π/3, π/3, 2π/3 the odd crease may be any of the three bounding the run, not only the middle one; only an odd crease outside the run is rejected. `checkLocalFlatFoldability` returns `bigLittleBig` for Kawasaki-passing, fully assigned vertices.
- **Correction to an earlier claim:** during planning I wrongly concluded that a four-valent triangle twist cannot fold flat (I assumed the middle crease had to be the odd one). The brute-force oracle in `big-little-big.test.ts` showed M, M, M, V is foldable at such a corner, and I fixed the rule. The triangle twist as originally planned is locally valid; whether it folds globally is a Phase 5 question.
- The oracle `foldsFlat` in `big-little-big.test.ts` is a single-vertex layer-order search with float positions (test only). The rule is exact against it at degree 4 and necessary at degree 6, but is not claimed sufficient above degree 4.
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

- The hexagon twist needs a "B" frame ring (hexDistance R ≥ s + 1) or no vertex is interior and Kawasaki/Maekawa pass vacuously. Rays are length R − s and end on ring lattice points, so no T-junctions.
- The twist has a fixed chirality and is centred at 0; the mirror twist is a reflection and placement goes through `Affine`, both left for later steps (8.1).
- `fromSegments` takes a per-segment `assignment` (default stays the argument); the same segment with two different assignments throws RangeError.

- The triangle twist (`triangleTwist(n, m)`) is centred at n/(1−ω), which is not a lattice point, so placement and mirroring stay for later steps (8.1). Its rotation ρ(z) = ωz + n maps the crease set to itself. Rays end on the middle of frame sides, never at frame corners.
- The frame is walked in unit steps, so very large sizes are slow rather than an overflow error; only non-safe-integer sizes throw.

- The star twist (`starTwist(s)`) is a spoked hexagram defined from first principles (no reference photos were ever in the repo): a collapsed star, not a rotating twist. Frame radius is fixed at 3s. Its M/V assignment is only half-turn symmetric because the centre needs 2 M / 4 V (a 3-fold or 6-fold M/V pattern gives 3/3 or 6/0 there). It is chiral; the mirror star is a reflection, left for placement (8.1).
- **Correction to my own plan:** the approved 3.6 plan kept both halves of the outer hexagon at each tip. The validators showed that fails Kawasaki (tip sectors π/3, π/3, π/3, π). The fix was found by an exhaustive search of 6-fold symmetric crease sets on the radius-3 grid (8 pass Kawasaki at every interior vertex, and each has valid M/V assignments); the sparsest was used. Hand-checking geometry is not enough: run the validators.
- Whether the star, like the triangle twist, folds flat globally is a Phase 5 question; only the local conditions are tested.

## Step 4.1 notes
- `localMvClauses(cp)` returns `{ variableCount, clauses, kawasaki }`; each clause has `kind` (`fixed` | `maekawa` | `big-little-big`) and an `edge` or `vertex`, so 4.2 can name the vertex that makes a pattern infeasible. Step 4.2 should refuse a formula with a non-empty `kawasaki` list.
- The formula is exact for Maekawa + Big-Little-Big, both necessary only; a solution still needs Phase 5 layer ordering.
- Enumeration is 2ⁿ per vertex, capped at degree 12. Revisit only if a tessellation has a high-degree vertex.
- `smallSectorRuns` was split out of `bigLittleBigFlat` (behaviour unchanged); `foldingCreases` out of `checkLocalFlatFoldability`.

## Step 4.2 notes
- `solveMv(cp)` returns `{status: "sat", assignment}` (true = M, one per edge), `{status: "unsat", vertices}` or `{status: "kawasaki", vertices}`. `withMvAssignment` fills only "U" creases and throws if the assignment contradicts a fixed M/V.
- An odd-degree vertex always fails Kawasaki, so through `solveMv` it is reported as `kawasaki`, never as the empty Maekawa clause. The empty-clause path is reachable only through a hand-built formula.
- Variables in no clause are not decided: they read false, so an unconstrained "U" crease becomes a valley.
- `mvSolutions` blocks each model over the constrained variables and restarts, so it re-propagates from scratch each time. Fine for Phase 5 pulling a few candidates; use watched literals or incremental solving if it must enumerate thousands.
- Every clause is rescanned each propagation round (no watched literals). Revisit if Phase 5 or large tessellations make solves slow.
- The planned test "centre has 2 M / 4 V" became "|#M − #V| = 2": Maekawa allows 4 M / 2 V at the star centre too, and the solver may return either.
- The `orbit` and `star-twist` timeouts seen under load are fixed by the global `testTimeout` (4.3).

## Open questions
- None.
