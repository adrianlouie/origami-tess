# Handoff

Overwrite this note at the end of each session. Keep it to the latest state only.

## Last session: 2026-11-07
Merged step 1.3, the SVG renderer ([PR #8](https://github.com/adrianlouie/origami-tess/pull/8)), and finished step 2.1, affine transform and group type ([PR #9](https://github.com/adrianlouie/origami-tess/pull/9), open).

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has the scaffold, CI, the `/next-step` and `/handoff` commands, Phase 1 complete (Eisenstein integers, triangular grid, SVG renderer).
- PR #9 (branch `step/2-1-affine-transform-group`) adds `core/symmetry/affine.ts` (`Affine`, `affine`, `apply`, `compose`, `inverse`, `translation`, `rotation60`, `reflection`, `about`, `isIsometry`) and `core/symmetry/group.ts` (`Group<T>`, `affineGroup`, `closure`). Local tests, typecheck and lint pass; CI was still pending when this was written. It also ticks 2.1 in the plan.
- No uncommitted work apart from the untracked `.idea/` folder (IDE files, deliberately not committed).

## Next step
Run `/next-step`: it merges PR #9 if CI is green, then starts 2.2, p6m generators and orbit tiling (test: orbit closed under the group). First thing to do: build p6m as `closure(affineGroup, [rotation60(1), reflection()], …)` for the point group D6, plus lattice translations, and check `isIsometry` on every generator.

## Gotchas and decisions
- `/next-step` squash-merges the open PR (CI green only; stops if red, pending or ambiguous).
- Each step's own PR ticks its plan box.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions. This overrides the default attribution reminder.
- Language is TypeScript. Python is only an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Lattice math uses exact integers (Eisenstein), not floats. Floats appear only in `app/render/`.
- Eisenstein uses `number`, not `bigint`. Property tests bound coordinates to ±1000 so that `N(z)N(w)` stays below 2⁵³.
- `toCartesian` maps a + bω to (a − b/2, b√3/2). `gridToSvg` negates y, since SVG's y-axis points down.
- Rendered floats are written to 6 decimals (`RENDER_PRECISION`), and float comparisons use `RENDER_TOLERANCE` = 1e-5. That is the one shared tolerance.
- An `Affine` is z ↦ M·z + t with M a 2×2 integer matrix on (a, b) coordinates and det M = ±1, so inverses stay integral. `compose(f, g)` applies g first.
- `closure` multiplies by generators only, which is correct for finite groups; it throws `RangeError` past its `limit`, so it cannot enumerate p6m itself (infinite). 2.2 must tile a finite window of translations.
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

## Open questions
- None.
