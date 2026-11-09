## Last session: 2026-11-09
Merged PR #28 (5.2b) with `/next-step`, planned 5.2d in plan mode, and built it on `step/5-2d-near-foldability`: conflict sets and a graded score. The star twist is a near miss, 4 of 30 faces (score 50/54). Earlier this day: 5.2 (layer solver) and 5.2b (triangle twist folds only for n ≥ 3m).

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`. `main` has everything through 5.2b. Branch `step/5-2d-near-foldability` holds 5.2d (PR open).
- New in 5.2d: `core/solve/conflict.ts` (generic MUS and minimum repair over tagged CNF) and `core/solve/near-foldability.ts` (`nearFoldability`, `mvConflict`). Tests 409 → 443.
- Earlier: `core/solve/layer-order.ts` and its test. Changed: `core/solve/layer-oracle.ts` (rule building split out, `oracleBrokenRules`, boolean mask), `core/solve/testing.ts` (now holds `arrangement`, `lineSets`, `foldedOrThrow`, `freed`, moved out of `stacking-global.test.ts`). Tests 389 → 409; typecheck, lint and `format:check` pass.
- `.idea/` is excluded locally through `.git/info/exclude`.

## Next step
Merge the 5.2d PR (`/next-step`), then ask whether to plan the next step (`CLAUDE.md`). **5.2c** (star twist) is unblocked: read `nearFoldability(starTwist(1)).conflict.creases` and either change those creases or accept a partly collapsible fold; its test is reworded to "folds flat, or reports a documented minimal conflict and score". 5.3 (layered render) still needs a per-region order plan.

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
- Verdicts on the shipped gadgets: hexagon twists (1,2) and (2,3) fold; triangle twist folds exactly when n ≥ 3m (`triangleTwist` throws below that; use `rawTriangleTwist` in tests for the unfoldable cases); star twist (1) does not.
- Tests take about 20 s CPU in all (limit 30 s per test). If CI times out, thin the degree-6 samples in `stacking.test.ts` first.
- Environment: macOS `sed` needs `-i ''` and rejects GNU escapes (use python for mutations); there is no `timeout` command; `pkill` is denied by the permission classifier.

- **Near-foldability (5.2d).** A tag is a face (stacking) or vertex (M/V); giving one up drops every clause that mentions it. `minimalConflict` returns *a* minimal conflict, not the smallest: the star twist has a 4-face one ({0, 4, 5, 12}) and the engine reports a 5-face one (20, 21, 23, 24, 27). `minimumRepair` is exact up to 12 tags, else `exact: false`.

## Open questions
- How should 5.3 draw a folding with no global order (per-cell ordering, or a transparent overlay)? Decide in its plan.
- 5.2c (star twist redesign) stays deferred; 5.3 needs a per-region order plan first.
