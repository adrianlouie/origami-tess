## Last session: 2026-11-07
Implemented plan step 3.6, the star twist (branch `step/3-6-star-twist-gadget`). Tests 175 → 184; typecheck, lint and `format:check` pass. Step 3.5 (#18) is merged. `rotate` and `hexagonFrame` moved to `core/gadgets/crease.ts`.

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has everything through step 3.5. Branch `step/3-6-star-twist-gadget` holds 3.6 and ticks it.
- `.idea/` is excluded locally through `.git/info/exclude`, so the tree is otherwise clean.

## Next step
Merge the 3.6 PR (`/next-step`). Phase 3 is then complete, so the next work is the **Phase 3 audit** (`audit/phase-3`, per the "Phase audits" section of `CLAUDE.md`), covering Phases 1 to 3, before step 4.1. `CLAUDE.md` says to ask whether you want a detailed plan before coding.

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
- `kawasakiFlat` takes directions in counter-clockwise cyclic order from any starting point (a shift swaps the odd and even sums, which are both π at a solution). It reduces to primitive vectors so products stay small; overflow still throws RangeError.
- `interiorVertices` counts a vertex's appearances in `cp.faces` walks and compares with its degree; a patch's outer ring is therefore never flagged. Vertices with a "B" edge are exempt.
- `checkLocalFlatFoldability` ignores "F" creases, runs Kawasaki on "U" creases too, and lists vertices with a "U" crease under `unassigned` instead of failing Maekawa. Both conditions are necessary only; Big-Little-Big is 3.5.
- The Kawasaki float cross-check test imports `RENDER_TOLERANCE` from `app/` (test only); `core/` source never does.
- Big-Little-Big (`bigLittleBigFlat`): for a maximal run of equal sectors strictly smaller than both neighbours, the creases bounding the run must not all agree. With sectors 2π/3, π/3, π/3, 2π/3 the odd crease may be any of the three bounding the run, not only the middle one; only an odd crease outside the run is rejected. `checkLocalFlatFoldability` returns `bigLittleBig` for Kawasaki-passing, fully assigned vertices.
- **Correction to an earlier claim:** during planning I wrongly concluded that a four-valent triangle twist cannot fold flat (I assumed the middle crease had to be the odd one). The brute-force oracle in `big-little-big.test.ts` showed M, M, M, V is foldable at such a corner, and I fixed the rule. The triangle twist as originally planned is locally valid; whether it folds globally is a Phase 5 question.
- The oracle `foldsFlat` in `big-little-big.test.ts` is a single-vertex layer-order search with float positions (test only). The rule is exact against it at degree 4 and necessary at degree 6, but is not claimed sufficient above degree 4.
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

- The hexagon twist needs a "B" frame ring (hexDistance R ≥ s + 1) or no vertex is interior and Kawasaki/Maekawa pass vacuously. Rays are length R − s and end on ring lattice points, so no T-junctions.
- The twist has a fixed chirality and is centred at 0; the mirror twist is a reflection and placement goes through `Affine`, both left for later steps (3.4 / 8.1).
- `fromSegments` takes a per-segment `assignment` (default stays the argument); the same segment with two different assignments throws RangeError.

- The triangle twist (`triangleTwist(n, m)`) is centred at n/(1−ω), which is not a lattice point, so placement and mirroring stay for later steps (3.6 / 8.1). Its rotation ρ(z) = ωz + n maps the crease set to itself. Rays end on the middle of frame sides, never at frame corners.
- The frame is walked in unit steps, so very large sizes are slow rather than an overflow error; only non-safe-integer sizes throw.

- The star twist (`starTwist(s)`) is a spoked hexagram defined from first principles (no reference photos were ever in the repo): a collapsed star, not a rotating twist. Frame radius is fixed at 3s. Its M/V assignment is only half-turn symmetric because the centre needs 2 M / 4 V (a 3-fold or 6-fold M/V pattern gives 3/3 or 6/0 there). It is chiral; the mirror star is a reflection, left for placement (8.1).
- **Correction to my own plan:** the approved 3.6 plan kept both halves of the outer hexagon at each tip. The validators showed that fails Kawasaki (tip sectors π/3, π/3, π/3, π). The fix was found by an exhaustive search of 6-fold symmetric crease sets on the radius-3 grid (8 pass Kawasaki at every interior vertex, and each has valid M/V assignments); the sparsest was used. Hand-checking geometry is not enough: run the validators.
- Whether the star, like the triangle twist, folds flat globally is a Phase 5 question; only the local conditions are tested.

## Open questions
- None.
