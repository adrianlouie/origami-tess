# Handoff

Overwrite this note at the end of each session. Keep it to the latest state only.

## Last session: 2026-11-07
Merged step 2.1 ([PR #9](https://github.com/adrianlouie/origami-tess/pull/9)) and finished step 2.2, p6m generators and orbit tiling ([PR #10](https://github.com/adrianlouie/origami-tess/pull/10), open, CI green).

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has the scaffold, CI, the `/next-step` and `/handoff` commands, Phase 1 (lattice) and step 2.1 (affine maps, `Group<T>`, `closure`).
- PR #10 (branch `step/2-2-p6m-orbit-tiling`) adds `core/symmetry/p6m.ts` (`p6m`, `P6m`, `inLattice`, `contains`), `core/symmetry/orbit.ts` (`orbit`) and test helpers in `core/symmetry/testing.ts`. Tests, typecheck and lint pass; the PR ticks 2.2 in the plan.
- No uncommitted work apart from the untracked `.idea/` folder (IDE files, deliberately not committed).

## Next step
Run `/next-step`: it merges PR #10 if CI is green, then starts 2.3, motif + group → tiled render (reuse `orbit` and the SVG renderer in `app/render/`). First thing to do: decide how a motif is drawn (points only, or edges between them) and add a snapshot test of a small tiling.

## Gotchas and decisions
- `/next-step` squash-merges the open PR (CI green only; stops if red, pending or ambiguous).
- Each step's own PR ticks its plan box. Write the handoff right after opening the PR and commit it to the same branch.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions. This overrides the default attribution reminder; I slipped once in 2.2 and amended before opening the PR.
- Language is TypeScript. Python is only an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Lattice math uses exact integers (Eisenstein), not floats. Floats appear only in `app/render/`.
- Eisenstein uses `number`, not `bigint`. Property tests bound coordinates to ±1000 so that `N(z)N(w)` stays below 2⁵³.
- `toCartesian` maps a + bω to (a − b/2, b√3/2). `gridToSvg` negates y, since SVG's y-axis points down.
- Rendered floats are written to 6 decimals (`RENDER_PRECISION`), and float comparisons use `RENDER_TOLERANCE` = 1e-5. That is the one shared tolerance.
- An `Affine` is z ↦ M·z + t with M a 2×2 integer matrix on (a, b) coordinates and det M = ±1, so inverses stay integral. `compose(f, g)` applies g first.
- p6m is πΛ ⋊ D6 with period π. `p6m(π)` throws unless πΛ is mirror-symmetric (π̄ ∈ πΛ), since otherwise the group is p6. Valid examples: 1, 2, 1−ω, 2+ω (norm 3). Invalid: 3+ω (norm 7).
- `orbit(group, motif, R)` is cut by the point's hex distance, not by translation count, so closure holds exactly. The enumeration bound is derived in its TSDoc.
- Mirror lines of D6 are at multiples of 30°; (2,1) lies on one, so use (3,1) for a generic point in tests.
- Prettier flags 8 files in `core/symmetry`, older ones included. It is not enforced by lint or CI.
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

## Open questions
- Should Prettier be enforced (lint or CI), or dropped from the repo?
