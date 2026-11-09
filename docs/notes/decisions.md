# Decisions

Decisions that the spec does not cover. Entries marked **confirmed** were answered by the human; entries marked **needs confirmation** were decided conservatively by the agent while building and should be reviewed.

## Confirmed by the human

- **2026-11-09 — How to handle uncovered decisions.** Decide conservatively, log here as "needs confirmation", list them in the hand-off. Only stop for choices that are expensive to reverse.
- **2026-11-09 — `settingSources`.** Agent sessions load `["project"]` only: the repository's `CLAUDE.md`, `.claude/skills` and `.claude/settings.json`. User-level (`~/.claude`) skills, MCP servers and hooks are not loaded.
- **2026-11-09 — `NotebookEdit`.** Its policy mode stays `review`, but because a notebook change cannot be safely simulated as text hunks, any `review` tool without a simulator falls back to the Allow / Deny confirmation card showing the full input.

## Needs confirmation
