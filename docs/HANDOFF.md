# Handoff


Overwrite this note at the end of each session. Keep it to the latest state only.

## Last session: 2026-11-07
Planning, repo creation, step 0.1 merged, step 0.2 (CI and PR template) in review.

## State
- Scope agreed: math-driven (no AI), uncut paper, triangular-lattice twist folds like the reference photos.
- **Language decided: TypeScript.** Python only as an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess) exists, cloned at `~/origami-tess`. `main` has the step 0.1 scaffold (TypeScript, Vitest, fast-check, ESLint, CLAUDE.md, docs/, smoke test).
- Step 0.2 adds `.github/workflows/ci.yml` (typecheck, lint, test on PRs and pushes to main) and a PR template.
- Architecture and phases are in `CLAUDE.md` and `docs/PLAN.md`.
- A schematic mockup of the 2D crease-pattern view was shown in chat. It is not verified foldable.

## Next step
Confirm CI goes green on the step 0.2 PR, merge it, tick 0.2 in `docs/PLAN.md`, then do 0.3 (`/handoff` and `/next-step` commands).

## Gotchas and decisions
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions.
- Lattice math uses exact integers (Eisenstein), not floats.
- Layer ordering (Phase 5) is the hardest piece.

## Open questions
