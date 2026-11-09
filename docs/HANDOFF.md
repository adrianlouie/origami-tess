## Last session: 2026-11-08
Merged the Phase 4 audit ([PR #23](https://github.com/adrianlouie/origami-tess/pull/23)), then built step 5.1a: fold maps, face adjacency and folded-face overlap ([PR #24](https://github.com/adrianlouie/origami-tess/pull/24), open, CI green). 5.1 was split in two; 5.1b is next.

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has everything through the Phase 4 audit. PR #24 (branch `step/5-1a-fold-maps-and-overlap`) adds `core/pattern/faces.ts`, `core/solve/folded-faces.ts`, `core/solve/overlap.ts` and the test helper `core/solve/testing.ts`; it ticks 5.1a. Tests 313 → 350; typecheck, lint and `format:check` pass. Nothing is uncommitted.
- `.idea/` is excluded locally through `.git/info/exclude`.

## Next step
Merge PR #24 (`/next-step`), then step **5.1b**: stacking constraints as clauses (taco-taco, taco-tortilla, tortilla-tortilla, transitivity), in `core/solve/stacking.ts`. First thing: ask the user whether they want a detailed plan (`CLAUDE.md`), then write the acceptance test: the formula is satisfiable exactly when the single-vertex `foldsFlat` oracle says the vertex folds. Move that oracle out of `big-little-big.test.ts` into a shared test helper first.

## Gotchas and decisions
- `/next-step` squash-merges the open PR (CI green only; stops if red, pending or ambiguous). Each step's own PR ticks its plan box; write the handoff right after opening the PR and commit it to the same branch.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions. This overrides the default attribution reminder.
- TypeScript only. Python is an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Lattice math is exact integers (Eisenstein, `number`, with `checkedMul`/`checkedAdd` throwing past 2⁵³). Floats appear only in `app/render/`; the one shared tolerance is `RENDER_TOLERANCE` = 1e-5. Prettier (`printWidth` 100) is enforced in CI.
- `toCartesian` maps a + bω to (a − b/2, b√3/2); SVG renderers negate y. **ω is at 120°**: 0, 1, ω is not a unit lattice triangle. Unit triangles are (a,b),(a+1,b),(a+1,b+1) and (a,b),(a+1,b+1),(a,b+1). My first overlap brute force got this wrong.
- `Affine` is z ↦ M·z + t, det M = ±1, `compose(f, g)` applies g first. D6 mirror lines are at multiples of 30°; (3,1) is a generic direction. p6m(π) needs π̄ ∈ πΛ (valid: 1, 2, 1−ω, 2+ω).
- Crease graph: `faces` lists bounded faces only (CCW walks); `holes[i]` holds components nested in `faces[i]`; `rotation[v]` is edge indices CCW from +x; half-edge h = 2e is v0→v1, twin is `h ^ 1`. `creasePattern` rejects non-planar input rather than splitting edges. `noUncheckedIndexedAccess` is on.
- Validators: Kawasaki is exact (Q = Π d₂ₖ·conj(d₂ₖ₋₁) is a negative real); Maekawa and Big-Little-Big are necessary only; `checkLocalFlatFoldability` ignores "F" creases and reports "U" vertices as `unassigned`. Gadgets need a "B" frame ring or the validators pass vacuously.
- The triangle and star twists are locally valid; whether they fold flat globally is a Phase 5 question. The star twist is a spoked hexagram from first principles (collapsed star, not a rotating twist); its M/V assignment is only half-turn symmetric.
- Solver: `solveMv(cp)` returns `sat` / `unsat` / `kawasaki`; variables in no clause read false (an unconstrained "U" becomes a valley). Performance caveats, unchanged: `creasePattern` validation is O(V·E + E²), no watched literals, `mvSolutions` restarts per solution, gadget frames are walked in unit steps.
- 5.1a: `foldFaces(cp)` returns `ok` (`transforms`, `flipped`) or `inconsistent` (`edges`). F_b = F_a ∘ ρ_e across M/V, F_b = F_a across F, "B" is not crossed. For one vertex, "ok" is exactly Kawasaki (tested over all 2497 spoke subsets). `creaseReflection` is an integer map only for 30°-multiple directions, so a random motif with other directions (8.2) will throw. Faces with holes, dangling creases and "U" creases throw.
- 5.1a overlap: `overlappingFacePairs` ear-clips each face, maps triangles by the face's isometry, and tests pairs with an exact separating-axis check (touching does not count). O(T²) with a bounding-box reject.
- For 5.1b: one variable per overlapping pair (i < j, "i above j"). Rule to pin against the oracle (not yet tested): across an M crease the neighbour goes below the face whose front shows, flipped faces invert it, V is the reverse. Emit `{variableCount, clauses}` like `MvFormula` so 5.2 can reuse `solveFormula`.

## Open questions
- None.
