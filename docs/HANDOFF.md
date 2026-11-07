# Handoff

Overwrite this note at the end of each session. Keep it to the latest state only.

## Last session: 2026-11-07
Finished step 1.2, the triangular grid ([PR #7](https://github.com/adrianlouie/origami-tess/pull/7), merged), and step 1.3, the SVG renderer ([PR #8](https://github.com/adrianlouie/origami-tess/pull/8), open, CI green).

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has the scaffold, CI, the `/next-step` and `/handoff` commands, Eisenstein integers (1.1) and `triangularGrid` / `hexDistance` in `core/lattice/grid.ts` (1.2).
- PR #8 (branch `step/1-3-svg-renderer`) adds `app/render/cartesian.ts` (`toCartesian`, `RENDER_PRECISION`, `RENDER_TOLERANCE`) and `app/render/svg.ts` (`gridToSvg`), with the R=3 file snapshot at `app/render/__snapshots__/grid-r3.svg`. It also ticks 1.3 in the plan and adds `app/**` to the vitest `include`. No uncommitted work.
- The snapshot's numbers were checked, but it has not been opened in a browser.

## Next step
Run `/next-step` to merge PR #8 (CI is green) and start 2.1, affine transform and group type (test: group axioms hold).

## Gotchas and decisions
- `/next-step` squash-merges the open PR (CI green only; stops if red, pending or ambiguous).
- Each step's own PR ticks its plan box. PR #7 forgot to, so 1.2 was ticked inside PR #8.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions. This overrides the default attribution reminder.
- Language is TypeScript. Python is only an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Lattice math uses exact integers (Eisenstein), not floats. Floats appear only in `app/render/`.
- Eisenstein uses `number`, not `bigint`. Property tests bound coordinates to ±1000 so that `N(z)N(w)` stays below 2⁵³.
- `toCartesian` maps a + bω to (a − b/2, b√3/2). `gridToSvg` negates y, since SVG's y-axis points down.
- Rendered floats are written to 6 decimals (`RENDER_PRECISION`), and float comparisons use `RENDER_TOLERANCE` = 1e-5. That is the one shared tolerance.
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

## Open questions
- None.
