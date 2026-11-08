## Last session: 2026-11-07
Ran the Phase 2 audit (plan step 2.4, branch `audit/phase-2`, PR to be opened). Fixed seven bugs, added 15 tests (88 → 103), enforced Prettier. PRs #11 and #12 are merged.

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has everything through step 2.3 plus the `CLAUDE.md` audit and planning rules. Branch `audit/phase-2` holds the audit; it ticks 2.4. Tests, typecheck, lint and `format:check` pass.
- No uncommitted work apart from the untracked `.idea/` folder (IDE files, deliberately not committed).

## Audit findings (Phase 2)
| # | Finding | Outcome |
|---|---|---|
| F1 | `norm` returned a wrong unsafe number near 2³⁰ | Fixed: checked arithmetic throws RangeError |
| F2 | `mul`, `apply`, `compose`, `isIsometry`, `hexDistance` could round before the final check | Fixed: every intermediate uses `checkedMul`/`checkedAdd`; BigInt property tests |
| F3 | `rotation60(1.5)` / `NaN` accepted | Fixed: RangeError |
| F4 | `svgDocument` stack overflow at grid R = 200 (`Math.min(...xs)`) | Fixed: single loop |
| F5, F6 | Stale `Edge`, `svg.ts` and `orbit.ts` docs | Fixed |
| F7 | `inLattice` with period 0 returned a silent false | Fixed: RangeError |
| F8 | SVG options unvalidated | Fixed: RangeError |
| extra | `tile` accepted zero-length motif edges | Now rejected |
Verified correct: the `windowElements` bound, the p6m mirror condition, the `isIsometry` argument, the `rot60` and conj formulas, grid V/E/F counts. Both SVG snapshots were rendered to PNG and checked by eye: a six-fold symmetric hexagonal grid, and a six-fold tiling of rhombi with dots at the orbit points. The snapshots are byte-identical to before.

## Next step
Merge the audit PR (`/next-step`), then step **3.1**, the crease graph data structure (test: Euler relation on faces). `CLAUDE.md` says to ask whether you want a detailed plan before coding.

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
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

## Open questions
- None.
