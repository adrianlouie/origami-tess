---
description: End the session by updating the plan and rewriting the handoff
---

Close out this session so the next one can pick up cleanly.

1. See what actually happened: `git status`, `git log --oneline -10`, and
   `gh pr list --state all --limit 5` for PR state. Base everything below on that, not memory.
2. Update `docs/PLAN.md`: tick a step only when it is finished and its tests pass. Add any new
   step or risk the session uncovered.
3. Overwrite `docs/HANDOFF.md`, keeping it short and current. Use exactly these sections:
   - `## Last session: <today's date>`: one or two lines on what was done, with PR links
   - `## State`: what works, what is half-done, any uncommitted work or open PR
   - `## Next step`: the exact plan step ID and the first thing to do
   - `## Gotchas and decisions`: non-obvious things learned or decided
   - `## Open questions`: anything waiting on the user
4. If the vault folder exists at
   `~/Documents/Personal Vault/Computer Science & ML/Origami Tessellation Designer/`, make the
   same checkbox and state updates in `Origami - Plan.md` and `Origami - Handoff.md`.
5. Show the user the resulting diff. If the current branch is a step branch, commit the doc
   changes there so they ship with that step's PR; otherwise ask where they should go.

Never add a `Co-Authored-By: Claude` trailer to commits or a "Generated with Claude Code" footer
to PR descriptions.
