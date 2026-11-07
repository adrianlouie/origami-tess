---
description: Merge the finished step's PR if CI is green, then start the next plan step on a fresh branch
---

Start the next step of the plan. Optional argument: a step ID such as `1.2`. $ARGUMENTS

1. Check `git status`. If the working tree is dirty, stop and report it; do not switch branches.
2. Merge the previous step's PR. Running this command is the user's standing approval to do so.
   - List open PRs with `gh pr list --state open --author @me`.
   - If none is open, continue.
   - If one is open, run `gh pr checks <number>`. Only when every check has passed, run
     `gh pr merge <number> --squash --delete-branch` and say which PR was merged.
   - If a check is failing or still pending, stop and report it; do not merge and do not start
     the next step. If more than one PR is open, stop and ask which to merge.
3. Update main: `git checkout main && git pull origin main`. This must come before reading the
   plan, because the merged PR is what ticks the previous step.
4. Read `CLAUDE.md`, `docs/HANDOFF.md` and `docs/PLAN.md`.
5. Pick the step: the ID given above, otherwise the first unchecked step in `docs/PLAN.md`
   (the "Next step" in `docs/HANDOFF.md` should agree; if it does not, say so).
6. Restate it to the user in a few lines: step ID and title, what will be built, the acceptance
   test, and any open question or gotcha from the handoff that touches it.
7. Create the branch `step/<phase>-<n>-<kebab-title>`, for example `step/1-1-eisenstein-integer`.
8. Wait for the user to confirm the restated step before writing code. Then write the acceptance
   test first, implement until it passes, and follow every convention in `CLAUDE.md`
   (including TSDoc and cited math).

Keep to one plan step per branch. If the step turns out too big for one PR, say so and propose a split.
