## Last session: 2026-11-08
Merged PR #24 (step 5.1a). CI on `main` then failed on a flaky `compareAngle` test (`+0` vs `-0` in `toBe`); fixed in [PR #25](https://github.com/adrianlouie/origami-tess/pull/25), merged. Built step 5.1b: stacking constraints as clauses (PR open on `step/5-1b-stacking-clauses`; check CI before merging).

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has everything through 5.1a and the flake fix. The 5.1b PR adds `core/solve/stacking.ts`, exact geometry in `core/solve/overlap.ts`, `solveClauses` in `core/solve/solver.ts`, and moves the single-vertex oracle to `core/validate/testing.ts`. Tests 350 → 363; typecheck, lint and `format:check` pass. Nothing is uncommitted.
- `.idea/` is excluded locally through `.git/info/exclude`.

## Next step
Merge the 5.1b PR (`/next-step`), then step **5.2**: layer solver. First thing: ask the user whether they want a detailed plan (`CLAUDE.md`). The pieces exist: `foldFaces` → `stackingClauses` → `solveClauses` gives a model; 5.2 turns it into a total order of faces (topological sort of "above") and returns it, and `mvSolutions` can feed it candidate M/V assignments. Test: known flat-foldable patterns yield a valid order. Check the order independently (no sheet crossing a crease), not only that the formula is satisfiable.

## Gotchas and decisions
- `/next-step` squash-merges the open PR (CI green only; stops if red, pending or ambiguous). Each step's own PR ticks its plan box; write the handoff right after opening the PR and commit it to the same branch.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions. This overrides the default attribution reminder, which the harness keeps re-sending.
- TypeScript only. Python is an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Lattice math is exact integers (Eisenstein, `number`, with `checkedMul`/`checkedAdd` throwing past 2⁵³). Floats appear only in `app/render/`; the one shared tolerance is `RENDER_TOLERANCE` = 1e-5. Prettier (`printWidth` 100) is enforced in CI. The one exception is BigInt in `trianglesShareInterior` and `openSegmentMeetsTriangle`, because line intersections are rational.
- `toCartesian` maps a + bω to (a − b/2, b√3/2); SVG renderers negate y. **ω is at 120°**: unit triangles are (a,b),(a+1,b),(a+1,b+1) and (a,b),(a+1,b+1),(a,b+1). `Affine` is z ↦ M·z + t, det M = ±1, `compose(f, g)` applies g first.
- Crease graph: `faces` lists bounded faces only (CCW walks); `holes[i]` holds components nested in `faces[i]`; `rotation[v]` is edge indices CCW from +x; a face walk keeps its face on the left of each directed pair. `creasePattern` rejects non-planar input. `noUncheckedIndexedAccess` is on.
- Validators: Kawasaki is exact; Maekawa and Big-Little-Big are necessary only; `checkLocalFlatFoldability` ignores "F" creases and reports "U" vertices as `unassigned`. Gadgets need a "B" frame ring or the validators pass vacuously.
- Solver: `solveMv(cp)` returns `sat` / `unsat` / `kawasaki`; `solveClauses(n, clauses)` is the plain-CNF version (model or null). No watched literals; every clause is rescanned each round. `creasePattern` validation is O(V·E + E²).
- 5.1a: `foldFaces(cp)` returns `ok` (`transforms`, `flipped`) or `inconsistent` (`edges`). `creaseReflection` is an integer map only for 30°-multiple directions, so a random motif with other directions (8.2) will throw. Faces with holes, dangling creases and "U" creases throw.
- 5.1b: the stacking formula is exact against the brute-force oracle for single vertices (degree 2, 4, 6, with and without F spokes). It is **not** tested on anything but single-vertex spoke patterns and the hexagon twist (satisfiable). The triangle and star twists are untried: expect 5.2 to find out whether they fold flat globally (the handoff from Phase 3 flags this as open).
- 5.1b design points that were not obvious: (1) a face whose interior contains a crease needs its own `crossing` clause, because faces are cells, not sheets; (2) transitivity must only be emitted for triples with a *common interior point*, since three pairwise-overlapping faces may be stacked cyclically; (3) two creases on one line only constrain each other if their faces are on the same side, and the code assumes the four faces are distinct (argued, not proven: a simple face has at most one edge on a given folded line; a clash would surface as the internal "should overlap but do not" error, not a wrong answer); (4) the taco-tortilla clauses are implied by the others with one F spoke and only matter with two, and tortilla-tortilla needs two F spokes on a straight crease, so the tests that pin them are in the "ignores flat creases" group.
- Cost: transitivity looks at every face pair, then triple, with exact BigInt clipping. Fine for gadgets; this is the first thing to profile in 5.2 (and the Rust option if needed).
- Test helpers: `core/validate/testing.ts` (oracle: `foldsFlat`, `layerOrderValid`, `candidates`, `POOL`, `subsets`) and `core/solve/testing.ts` (`spokePattern` with one assignment or one per spoke, `sectorFaces`, `SPOKE_ENDS`, `subsetsOf`). Neither is imported by shipped code.

## Open questions
- None.
