## Last session: 2026-11-07
Implemented plan step 3.1 (branch `step/3-1-crease-graph`, PR open). Added exact direction predicates and the crease graph. Tests 103 → 130; typecheck, lint and `format:check` pass. The Phase 2 audit PR (#13) is merged.

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has everything through the Phase 2 audit. Branch `step/3-1-crease-graph` holds 3.1 and ticks it.
- No uncommitted work apart from the untracked `.idea/` folder (IDE files, deliberately not committed).

## Next step
Merge the 3.1 PR (`/next-step`), then step **3.2**, the Kawasaki and Maekawa validators (test: known-valid pass, known-invalid fail). `CLAUDE.md` says to ask whether you want a detailed plan before coding.

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
- `CreasePattern.faces` lists bounded faces only (outer boundary walks, counter-clockwise); the unbounded face is implicit, so `faceCount = faces.length + 1`. A component nested inside a face is not listed as a hole of it.
- `rotation[i]` is vertex i's edge indices counter-clockwise from +x. Step 3.2 needs this: the sector angles between consecutive edges are what Kawasaki sums.
- `creasePattern` rejects non-planar input (crossings, a vertex inside an edge, duplicates, self-loops) instead of splitting edges. Splitting would be its own step.
- Half-edge h = 2e is v0→v1 and 2e + 1 is v1→v0, so the twin is `h ^ 1`.
- `noUncheckedIndexedAccess` is on, so array reads need `at(...)`, `?.` or `!`.
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

## Open questions
- None.
