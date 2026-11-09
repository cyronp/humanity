# Decisions

Decisions that the spec does not cover. Entries marked **confirmed** were answered by the human; entries marked **needs confirmation** were decided conservatively by the agent while building and should be reviewed.

## Confirmed by the human

- **2026-11-09 — How to handle uncovered decisions.** Decide conservatively, log here as "needs confirmation", list them in the hand-off. Only stop for choices that are expensive to reverse.
- **2026-11-09 — `settingSources`.** Agent sessions load `["project"]` only: the repository's `CLAUDE.md`, `.claude/skills` and `.claude/settings.json`. User-level (`~/.claude`) skills, MCP servers and hooks are not loaded.
- **2026-11-09 — `NotebookEdit`.** Its policy mode stays `review`, but because a notebook change cannot be safely simulated as text hunks, any `review` tool without a simulator falls back to the Allow / Deny confirmation card showing the full input.

## Needs confirmation

- **M1 — Token transport.** The token is sent as `?token=` on the WebSocket URL (browsers cannot set WebSocket headers) and as `Authorization: Bearer` on `/api/auth`. The web app moves it from the page URL into `localStorage` on first load.
- **M1 — Extra endpoint `/api/auth`.** Not in the spec. Added so the UI can show "wrong token" and "daemon not running" as different, actionable states.
- **M1 — Default policy details.** Besides `Read`/`Glob`/`Grep`, `TodoWrite` and `Skill` default to `auto` (neither touches the worktree's files; a Skill's own tool calls are still gated). `NotebookEdit` defaults to `review`, `WebFetch`/`WebSearch`/`Bash`/`mcp__*` to `confirm`. Everything else, including `Agent`, falls back to `confirm`.
- **M1 — Policy shape.** A policy is an ordered list of `{ pattern, mode }` rules. A pattern is an exact tool name or a prefix wildcard ending in `*`. Exact beats wildcard, longer wildcard beats shorter.
- **M1 — `addLocal` path.** A path inside a repository is resolved to the repository root (`git rev-parse --show-toplevel`). The same root cannot be added twice.
- **M1 — shadcn/ui setup.** Generated with the official CLI (`shadcn@4.23.0`, base `radix`, preset `nova`). The CLI added three packages that the spec does not list: `cn` (shadcn's class merger, replacing `clsx` + `tailwind-merge`), `shadcn` (its Tailwind stylesheet) and `@fontsource-variable/geist` (the preset's font). All pinned exactly.
- **M1 — "Live layer and test layer" per service.** Services whose test double adds value get one (`AgentRunner`, `GitHubService` through a mocked `HttpClient`, the database through `DatabaseTest`). `GitService` and `ProjectService` are tested through their live layers against temp repositories and a temp data directory, as the spec's testing section asks.
- **M2 — What `Git.diff` shows.** The working tree against `HEAD`, plus untracked files synthesized as all-additions hunks (git's own diff omits them). Untracked files over 512 KB or containing NUL bytes are listed without content.
- **M2 — No checkout RPC.** `GitService.checkout` exists and is tested inside worktrees, but no RPC exposes it for the user's repository, because that would modify the user's working copy. "Switch branch from the UI" is implemented as choosing the base branch for a new session.
- **M2 — `Git.createBranch` only creates a ref** in the project's repository (`git branch -- <name> <from>`); nothing is checked out.
- **M2 — CRLF handling in the `Edit` simulator.** Matching is done on LF-normalized text and the file's CRLF endings are restored, mirroring how the model sees files. `Write` is simulated with the content exactly as given.
- **M2 — A no-op change is denied, not allowed.** When a simulated `Edit`/`Write` produces content identical to the file, there is nothing to review; the tool call is denied with an explanatory message rather than allowed to touch the file unreviewed.
