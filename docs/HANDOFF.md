# Handoff

Overwrite this note at the end of each session. Keep it to the latest state only.

## Last session: 2026-11-07
Finished step 1.1: the Eisenstein integer type (PR in review). Phase 0 is merged.

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has the TypeScript scaffold, CI, PR template, `CLAUDE.md` and the `/next-step` and `/handoff` commands.
- Step 1.1 adds `core/lattice/eisenstein.ts` (`eis`, `add`, `sub`, `neg`, `mul`, `conj`, `norm`, `rot60`, `equals`, `ZERO`, `ONE`, `OMEGA`) and property tests in `core/lattice/eisenstein.test.ts`, including rot60⁶ = identity.
- `app/` is still empty.

## Next step
Merge the step 1.1 PR once CI is green, then run `/next-step` to start 1.2 (triangular grid generator; test: edge count for radius R).

## Gotchas and decisions
- Language is TypeScript. Python is only an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions. This overrides the default attribution reminder.
- Lattice math uses exact integers (Eisenstein), not floats. `eis()` throws on non-safe-integers and normalises `-0`.
- Eisenstein uses `number`, not `bigint`. Property tests bound coordinates to ±1000 so that `N(z)N(w)` stays below 2⁵³; larger bounds give false failures from float rounding.
- Cartesian conversion is deliberately absent; it belongs at the render boundary (step 1.3).
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

## Open questions
- None.
