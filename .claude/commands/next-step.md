---
description: Start the next plan step on a fresh branch
---

Start the next step of the plan. Optional argument: a step ID such as `1.2`. $ARGUMENTS

1. Read `CLAUDE.md`, `docs/HANDOFF.md` and `docs/PLAN.md`.
2. Pick the step: the ID given above, otherwise the first unchecked step in `docs/PLAN.md`
   (the "Next step" in `docs/HANDOFF.md` should agree; if it does not, say so).
3. Restate it to the user in a few lines: step ID and title, what will be built, the acceptance
   test, and any open question or gotcha from the handoff that touches it.
4. Check `git status`. If the working tree is dirty, stop and report it; do not switch branches.
5. Update main: `git checkout main && git pull origin main`.
6. Create the branch `step/<phase>-<n>-<kebab-title>`, for example `step/1-1-eisenstein-integer`.
7. Wait for the user to confirm the restated step before writing code. Then write the acceptance
   test first, implement until it passes, and follow every convention in `CLAUDE.md`
   (including TSDoc and cited math).

Keep to one plan step per branch. If the step turns out too big for one PR, say so and propose a split.
