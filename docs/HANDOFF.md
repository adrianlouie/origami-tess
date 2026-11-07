# Handoff


Overwrite this note at the end of each session. Keep it to the latest state only.

## Last session: 2026-11-07
Planning, plus repo creation. No code written yet.

## State
- Scope agreed: math-driven (no AI), uncut paper, triangular-lattice twist folds like the reference photos.
- **Language decided: TypeScript.** Python only as an optional `sympy` scratchpad; Rust→WASM only if the Phase 5 solver is too slow.
- Private repo [origami-tess](https://github.com/adrianlouie/origami-tess) exists, cloned at `~/origami-tess`. `main` holds only an initial commit (README, .gitignore).
- Architecture, phases and CLAUDE.md draft are written up in this folder.
- A schematic mockup of the 2D crease-pattern view was shown in chat. It is not verified foldable.

## Next step
Settle the PR footer question, then do step 0.1 in `docs/PLAN.md` on a branch `step/0-1-scaffold`.

## Gotchas and decisions
- Never add a `Co-Authored-By: Claude` trailer to commits, and no "Generated with Claude Code" footer on PR descriptions.
- Lattice math uses exact integers (Eisenstein), not floats.
- Layer ordering (Phase 5) is the hardest piece.

## Open questions
