## Last session: 2026-11-09
Merged PR #26 (5.1b) with `/next-step`, planned step 5.2 in plan mode, and built it on branch `step/5-2-layer-solver`: `layerOrder`, which turns a model of the stacking clauses into a stacking of the faces. Main finding: the hexagon twists fold but have no global linear face order.

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`. `main` has everything through 5.1b. Branch `step/5-2-layer-solver` holds 5.2 (PR open once pushed); `docs/PLAN.md` ticks 5.2 in that PR.
- New: `core/solve/layer-order.ts` and its test. Changed: `core/solve/layer-oracle.ts` (rule building split out, `oracleBrokenRules`, boolean mask), `core/solve/testing.ts` (now holds `arrangement`, `lineSets`, `foldedOrThrow`, `freed`, moved out of `stacking-global.test.ts`). Tests 389 → 409; typecheck, lint and `format:check` pass.
- `.idea/` is excluded locally through `.git/info/exclude`.

## Next step
Merge the 5.2 PR (`/next-step`), then **5.2b**: repair the triangle twist's M/V assignment, using `layerOrder` to test candidates (12 of 26 locally valid assignments of (1,1) and 24 of 26 of (2,1) fold). Ask the user first whether to plan it (`CLAUDE.md`). **5.3** (layered render) needs a rethink before it is planned, see below. 5.2c (star twist redesign) stays deferred.

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
- The plan's 5.2 acceptance said "valid order" and the first plan said a non-null `order` for the hexagon twists; the test instead requires the relation to pass the oracle and asserts `order` is null with the ring above. Orders are non-null for single vertices, lattice-line arrangements and every foldable triangle twist assignment.
- Test oracles: `foldsFlat` (single vertex, 1D, `core/validate/testing.ts`) and `layerOracle` / `oracleBrokenRules` (whole pattern, float sampling, convex faces; independent of `stacking.ts`). The oracle's old 32-bit bitmask is now a boolean array.
- Verdicts on the shipped gadgets: hexagon twists (1,2) and (2,3) fold; triangle twists (1,1), (2,1), (1,3) do not, as shipped; star twist (1) does not.
- Tests take about 20 s CPU in all (limit 30 s per test). If CI times out, thin the degree-6 samples in `stacking.test.ts` first.
- Environment: macOS `sed` needs `-i ''` and rejects GNU escapes (use python for mutations); there is no `timeout` command; `pkill` is denied by the permission classifier.

## Open questions
- How should 5.3 draw a folding with no global order (per-cell ordering, or a transparent overlay)? Decide in its plan.
- Confirm doing 5.2b next, with 5.2c deferred.
