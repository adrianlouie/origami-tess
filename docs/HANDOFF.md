## Last session: 2026-11-10
Ran `/next-step`: merged PR #32 (5.3), planned the Phase 5 audit in plan mode and did it on `audit/phase-5` (5.4). Not yet committed or pushed when this was written.

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`. `main` has everything through 5.3. Branch `audit/phase-5` holds the 5.4 audit (tests 509 → 558; typecheck, lint, `format:check` pass).
- **Audit findings (5.4)**, details in `docs/PLAN.md`: the `stackFaces` round-limit off-by-one; unvalidated `minimumRepair` weights; unchecked area and weight sums; the `foldedToSvg` conflict-crease lookup; `layeredView` building the formula twice. All fixed with a test that fails without the fix, except the overflow hardening in `nearFoldabilityOf` (no buildable pattern reaches 2⁵³ areas) and the `layeredView` change (behaviour-preserving).
- Ruled out: `sameDirection` uses plain `x * y` but needs only the sign of a product of lattice-coordinate changes, which are bounded by the checked construction; snapshots show no seams.
- Gadgets cannot reach 2⁵³: they list rays as unit edges, so memory runs out first (a large `triangleTwist` ran out of heap). Overflow is tested with a hand-built rhombus instead.
- A pipeline test (`core/pipeline.test.ts`) now runs every gadget variant through validate, solve and render; add new gadgets to its table.
- `fast-check` gotcha: `.filter` on a tuple that can never pass (n = 1 with `a !== b`) hangs the run synchronously, so `testTimeout` cannot fire.
- Rendered by eye (`qlmanage -t -s 700 -o <dir> x.svg`): the folded hexagon twist is one hexagon; the partial star shows one hatched triangle because its four dropped faces fold onto the same place.
- `.idea/` is excluded locally through `.git/info/exclude`.

## Next step
Merge the audit PR (`/next-step`), then ask whether to plan the next step (`CLAUDE.md`). Next is **6.1**, the Three.js scene with orbit, zoom and pan (Phase 6, 3D viewer).

## Gotchas and decisions
- `/next-step` squash-merges the open PR (CI green only; stops if red, pending or ambiguous). Each step's own PR ticks its plan box; write the handoff right after opening the PR and commit it to the same branch.
- Commits and PRs follow `CLAUDE.md`: no `Co-Authored-By: Claude` trailer and no "Generated with Claude Code" footer. This overrides the default attribution reminder, which the harness keeps re-sending.
- TypeScript only. Python is an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow (it is not: 2 to 72 ms on the gadgets).
- Lattice math is exact integers (Eisenstein, `number`, with `checkedMul`/`checkedAdd` throwing past 2⁵³). Floats appear only in `app/render/`; the one shared tolerance is `RENDER_TOLERANCE` = 1e-5. The exception is BigInt in `trianglesShareInterior` and `openSegmentMeetsTriangle`, because line intersections are rational. Prettier (`printWidth` 100) is enforced in CI.
- `toCartesian` maps a + bω to (a − b/2, b√3/2); SVG renderers negate y. **ω is at 120°**. `Affine` is z ↦ M·z + t, det M = ±1, `compose(f, g)` applies g first.
- Crease graph: `faces` lists bounded faces only (CCW walks); `holes[i]` holds components nested in `faces[i]`; `rotation[v]` is edge indices CCW from +x. `creasePattern` rejects non-planar input. `noUncheckedIndexedAccess` is on.
- Validators: Kawasaki is exact; Maekawa and Big-Little-Big are necessary only. Gadgets need a "B" frame ring or the validators pass vacuously.
- Solver: `solveMv(cp)` for M/V; `solveClauses(n, clauses)` is the plain-CNF DPLL (model or null; no watched literals). `foldFaces(cp)` returns `ok` or `inconsistent`; `creaseReflection` is an integer map only for 30°-multiple directions, so a random motif with other directions (8.2) will throw.
- Stacking: `stackingClauses(cp, folded)` has one variable per overlapping pair (true = i above j) and six clause kinds. **5.2:** `layerOrder(cp)` returns `ok` (`above`, `order`), `unfoldable` or `inconsistent`. `order` lists every face top first, or is null when every model has a cycle (blocked up to 1000 times). The "top" is the side an unflipped face's front looks toward.
- **Hexagon twists have `order: null`.** Faces 1, 3, 4, 6, 8, 10 form a ring that every valid stacking orders cyclically (no three of them share a point, so transitivity does not apply). This is real, not a bug: blocking the ring makes the formula unsatisfiable, and the blocking clause is implied by any linear order. 5.3 therefore cannot paint faces with one sorted list; it needs an order per region (for example, per cell of the arrangement of folded creases, where the faces over it are totally ordered). Open question for the 5.3 plan.
- The plan's 5.2 acceptance said "valid order" and the first plan said a non-null `order` for the hexagon twists; the test instead requires the relation to pass the oracle and asserts `order` is null with the ring above. Orders are non-null for single vertices and lattice-line arrangements; the symmetric triangle twist (n ≥ 3m) and the hexagon twists are cyclic (`order: null`).
- Test oracles: `foldsFlat` (single vertex, 1D, `core/validate/testing.ts`) and `layerOracle` / `oracleBrokenRules` (whole pattern, float sampling, convex faces; independent of `stacking.ts`). The oracle's old 32-bit bitmask is now a boolean array.
- Verdicts on the shipped gadgets: hexagon twists (1,2) and (2,3) fold; triangle twist folds exactly when n ≥ 3m (`triangleTwist` throws below that; use `rawTriangleTwist` in tests for the unfoldable cases); the star twist folds in its `full` variant (the default) and folds in part, score 50/54, in `partial`.
- **Star twist (5.2c).** The `full` M/V is the table `VVVMMMVV`/`MVMVMMVV`/`VMVMMMMV` per spoke k mod 3 (order a, b, e, g, h, x, y⁺, y⁻), found by search and not by a rule. It is half-turn symmetric, not threefold or 120°-symmetric. The crease set is chiral (`hₖ` is `Tₖ→Qₖ₊₁`, its mirror is not creased), so a mirror image is not a symmetry. 5.1b's "none of 150 folds" was a sampling miss: 2 of 500 sampled half-turn-symmetric assignments fold, at least 6 in all. The layer oracle cannot decide the star outright (435 pairs against its limit of 26), so for `full` it checks the found stacking with `oracleBrokenRules`.
- Enumerating locally valid assignments with `mvSolutions` is slow beyond a few hundred: each solution adds a blocking clause and restarts DPLL, and a first attempt over all 48 free creases ran over an hour without finishing. Tie each edge to its half-turn image to halve the variables, cap the count, and log progress.
- Tests take about 20 s CPU in all (limit 30 s per test). If CI times out, thin the degree-6 samples in `stacking.test.ts` first.
- Environment: macOS `sed` needs `-i ''` and rejects GNU escapes (use python for mutations); there is no `timeout` command; `pkill` is denied by the permission classifier.

- **Near-foldability (5.2d).** A tag is a face (stacking) or vertex (M/V); giving one up drops every clause that mentions it. `minimalConflict` returns *a* minimal conflict, not the smallest: the star twist has a 4-face one ({0, 4, 5, 12}) and the engine reports a 5-face one (20, 21, 23, 24, 27). `minimumRepair` is exact up to 12 tags, else `exact: false`.
- **Locality (5.2e).** Depth uses the sheet topology (a crease with no bounded face on one side), not the "B" label. It is a profile, not one score: how to rank depth, pieces and area is left to 8.2. Whether an edge conflict is acceptable in practice is for the bar-and-hinge simulation (6.2) to say.

## Open questions
- None open. (5.3 settled how to draw a folding with no global order: pairwise masks, see `docs/PLAN.md`.)
