# Handoff

Overwrite this note at the end of each session. Keep it to the latest state only.

## Last session: 2026-11-07
Finished Phase 0 repo setup: scaffold (PR #1), CI and PR template (PR #2), comment conventions in `CLAUDE.md` (PR #3), and the `/next-step` and `/handoff` commands (step 0.3, in review).

## State
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess), cloned at `~/origami-tess`.
- `main` has the TypeScript scaffold (Vitest, fast-check, ESLint), CI on every PR, a PR template and `CLAUDE.md`.
- `core/` and `app/` are empty; no tessellation code exists yet.
- Step 0.3 adds `.claude/commands/next-step.md` and `.claude/commands/handoff.md`. They have not been run yet.

## Next step
Merge the step 0.3 PR once CI is green, then run `/next-step` to start 1.1 (Eisenstein integer type; test: rot60⁶ = identity).

## Gotchas and decisions
- Language is TypeScript. Python is only an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions.
- Lattice math uses exact integers (Eisenstein), not floats.
- Layer ordering (Phase 5) is the hardest piece.
- A schematic crease-pattern mockup was shown in chat; it is not verified foldable.

## Open questions
- None.
