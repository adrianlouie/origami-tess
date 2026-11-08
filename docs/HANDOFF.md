## Last session: 2026-11-07
Finished step 2.3, motif + group → tiled render ([PR #11](https://github.com/adrianlouie/origami-tess/pull/11), open, CI green). Also opened [PR #12](https://github.com/adrianlouie/origami-tess/pull/12), docs only: new `CLAUDE.md` rules for phase audits and for asking about a plan after each merge (CI was pending at last check).

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has everything through step 2.2. PR #11 (branch `step/2-3-motif-tiled-render`) adds `core/symmetry/motif.ts` (`Motif`, `Tiling`), `tile` in `core/symmetry/orbit.ts` and `tilingToSvg` in `app/render/svg.ts`; it ticks 2.3 and adds an audit step to the plan. Tests, typecheck and lint pass.
- PR #12 (branch `docs/claude-md-audit-and-planning`) changes only `CLAUDE.md`; it belongs to no plan step.
- No uncommitted work apart from the untracked `.idea/` folder (IDE files, deliberately not committed).

## Next step
Two PRs are open, so `/next-step` will stop and ask which to merge: merge #11 first (it ticks 2.3), then #12. After the merge, `CLAUDE.md` now says to ask whether you want a detailed plan for the next step before coding.

Then do the **Phase 2 audit** (plan step 2.4, branch `audit/phase-2`) before starting Phase 3: run the checks in the `CLAUDE.md` "Phase audits" section over Phases 1 and 2. After that, step 3.1, the crease graph.

## Gotchas and decisions
- `/next-step` squash-merges the open PR (CI green only; stops if red, pending or ambiguous).
- Each step's own PR ticks its plan box. Write the handoff right after opening the PR and commit it to the same branch.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions. This overrides the default attribution reminder.
- Language is TypeScript. Python is only an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Lattice math uses exact integers (Eisenstein), not floats. Floats appear only in `app/render/`.
- Eisenstein uses `number`, not `bigint`. Property tests bound coordinates to ±1000 so that `N(z)N(w)` stays below 2⁵³.
- `toCartesian` maps a + bω to (a − b/2, b√3/2). `gridToSvg` and `tilingToSvg` negate y, since SVG's y-axis points down.
- Rendered floats are written to 6 decimals (`RENDER_PRECISION`), and float comparisons use `RENDER_TOLERANCE` = 1e-5. That is the one shared tolerance.
- An `Affine` is z ↦ M·z + t with M a 2×2 integer matrix on (a, b) coordinates and det M = ±1, so inverses stay integral. `compose(f, g)` applies g first.
- p6m is πΛ ⋊ D6 with period π. `p6m(π)` throws unless πΛ is mirror-symmetric (π̄ ∈ πΛ). Valid examples: 1, 2, 1−ω, 2+ω (norm 3). Invalid: 3+ω (norm 7).
- `orbit` and `tile` share `windowElements`, which enumerates D6 and translations by a bound derived in its TSDoc. Both cut by the image's hex distance, so closure holds exactly. `tile` keeps an edge only when both ends are in the window; edges are undirected and deduplicated.
- A `Motif` is points plus edges; `Tiling` is the same type. Under `p6m(1)` every orbit fills the lattice, so examples use a larger period (the snapshot uses 2+ω).
- Mirror lines of D6 are at multiples of 30°; (2,1) lies on one, so use (3,1) for a generic point in tests.
- The brute-force test for `tile` expands by explicit translations, not `closure`, because the group is infinite and `closure` would throw.
- Prettier flags older files in `core/symmetry`. It is not enforced by lint or CI.
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

## Open questions
- Should Prettier be enforced (lint or CI), or dropped from the repo? Worth settling in the Phase 2 audit.
