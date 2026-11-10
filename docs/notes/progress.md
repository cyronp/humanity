# Progress

## M0 — Scaffold (2026-11-09)

- npm workspaces + Turborepo with `dev`, `build`, `lint`, `typecheck`, `test` tasks run from the root.
- Four workspaces: `apps/server`, `apps/web`, `packages/contracts`, `packages/diff`. Each has a smoke test.
- TypeScript strict (plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESLint flat config, Prettier, Vitest.
- Workspace packages are consumed from source through a `source` export condition in dev and tests, and from `dist` in the production build.
- API verification written to `docs/notes/api-verification.md`. Notable: TypeScript is pinned to 6.0.3 because `typescript-eslint` does not support 7 yet.

## M1 — Daemon foundation (2026-11-09)

- Daemon: Effect HTTP server bound to `127.0.0.1` (default port 7420, `HUMANITY_PORT`), data in `~/.humanity` (`HUMANITY_HOME`).
- Auth token generated on first start into `<home>/auth-token`; the banner prints the link to open. `/rpc` checks `?token=` before upgrading to a WebSocket; `/api/auth` lets the web app tell a bad token from a stopped daemon.
- SQLite through Effect SQL on `node:sqlite`, with the `Migrator`. `0001_initial` creates every table from spec section 7.
- `GitService` (first slice: run git with argument arrays, repo root, current/default branch, origin URL) and `ProjectService` (`list`, `get`, `addLocal`, `remove`).
- Contracts: `Project`, `ToolPolicy` + `resolveToolMode`, tagged errors, `Projects.list/addLocal/remove`.
- Web: TanStack Router (file-based), `AtomRpc` client over the WebSocket, shadcn/ui, light/dark theme, project list with add and remove.
- Tests: `ProjectService` on temp repos including persistence across restarts; the daemon over a real WebSocket, including rejection without a token.
- Not verified in a real browser by the agent (no browser tool available). The atoms layer was exercised against a running daemon from Node.

## M2 — Git (2026-11-09)

- `packages/diff` is complete: `computeHunks`, `applyHunks` (any subset, via `applyPatch` on a filtered patch), decisions and outcomes, `parseUnifiedDiff`, `toDiffLines`, the `Edit`/`Write` simulators and the two agent messages (`formatPartialApplicationMessage`, `formatRejectionMessage`). 55 tests, including every subset of hunks checked against an independent reference implementation, trailing-newline cases and CRLF files.
- `GitService` now covers `listBranches`, `createBranch`, `checkout`, `status` (`--porcelain=v2 -z`), `diff` (tracked changes through `parsePatch`, untracked files as all-additions hunks), `worktreeAdd/Remove/List` and `commit`. User-supplied names are validated by `git check-ref-format` / `rev-parse --verify` before use.
- RPC group `Git`: `branches`, `createBranch`, `status`, `diff`.
- Web: project page at `/projects/$projectId` with branches (and a create form), working-copy status and the uncommitted diff, rendered by the shared `HunkView` with Shiki dual-theme highlighting.
- Tests: `GitService` integration tests on temp repos (worktrees, argument safety, tagged errors) and unit tests for the porcelain parsers.

## M3 — Agent chat (2026-11-09)

- Contracts: `Session`, normalized `ChatMessage` contents (user, assistant blocks, tool results, turn result, init, notice, other), `ToolCall`, the `SessionEvent` union and the `Sessions` RPC group (`list`, `get`, `create`, `sendMessage`, `interrupt`, `end`, streaming `subscribe`).
- `AgentRunner` service with a live layer over the SDK's `query()` in streaming input mode and a scripted fake for tests. The live runner uses `permissionMode: "default"`, puts only the project's exact `auto` tools in `allowedTools`, loads `settingSources: ["project"]`, adds a `PreToolUse` guard that forces every non-`auto` tool into `canUseTool`, and keeps the SDK's state in `<home>/claude` via `CLAUDE_CONFIG_DIR`.
- `SessionService`: creates `humanity/<short-id>-<slug>` branches and worktrees under `<home>/worktrees/<projectId>/<sessionId>`; one agent run per session, resumed with the stored SDK session id after a restart; interrupt; end (optionally removing the worktree, keeping the branch); sessions left `running` by a crash become `interrupted` with a notice. Raw SDK messages are stored next to the normalized ones.
- As the milestone asks, every non-`auto` tool is denied with an explanatory message for now.
- `Projects.remove` now stops the project's agents and removes its session worktrees (only paths inside the data directory).
- Web: sessions list and "start session" form on the project page; the workspace at `/projects/$projectId/sessions/$sessionId` with header (branch, worktree, status, interrupt, end), Streamdown chat with Shiki-highlighted code (sharing the diff highlighter), streamed drafts, tool call cards and a composer. The `?file=&hunk=` search params are typed already.
- Tests: SDK message normalizer, session lifecycle with the fake agent (transcript, denials, snapshot + live events, resume after restart, crash recovery, interrupt, end, project removal), sessions over a real WebSocket, and the web reducer.
- Smoke-tested the live runner once against the real CLI with an invalid API key (no billable call): the CLI started in the worktree, accepted the options, wrote its transcript under `<home>/claude`, and the auth failure surfaced as an `error` status with the CLI's message. A real conversation has not been run by the agent.

## M4 — Human in the loop (2026-11-09)

- Contracts: `ProposedChange`, `PendingConfirmation`, the `Approval` union, `ApprovalRequested` / `ApprovalResolved` events (the snapshot carries every approval), the `Approvals` RPC group (`listPending`, `decideChange`, `decideConfirmation`) and `Projects.getPolicy` / `setPolicy`.
- `PolicyService`: per-project policies with a synchronous `modeFor`, read on every tool call, so a policy change (including "always allow") applies to running agents. The `PreToolUse` guard uses the same live lookup, so tightening a tool that a running agent was started with in `allowedTools` still routes it to a human.
- `ApprovalService`: a registry of `Deferred`s keyed by approval id. Requests are persisted and published before the agent blocks; decisions are validated (every hunk decided, decided only once), applied, persisted (`proposed_changes`, `hunk_decisions`, `confirmations`) and then release the agent. Interrupts, ending a session and daemon restarts expire pending requests.
- Review flow: the target path must be inside the session worktree; the current file is read, `Edit`/`Write` are simulated, and hunks come from `packages/diff`. All approved → `allow` (the SDK writes); all rejected → `deny` with the per-hunk comments; partial → the daemon writes only the approved hunks, after checking the file did not change during review, and returns the exact `PARTIALLY APPLIED` message. `review` tools without a simulator (`NotebookEdit`) get a confirmation card instead.
- Confirm flow: allow, deny with a comment (sent to the agent), and "always allow this tool in this project".
- Session status switches to `waiting_for_human` while anything is pending, and back to `running` once answered.
- Web: review panel (opens automatically, one tab for now) with per-hunk approve/reject/comment, approve all / reject all, a single submit per change, keyboard shortcuts `j`/`k`/`a`/`r`/`c`/`Enter` (`Ctrl+Enter` from a comment), deep links `?file=&hunk=` kept in sync with the focused hunk; confirmation cards pinned above the composer; approval outcomes on tool cards; "Waiting for you" in the page title; a tool policy table on the project page.
- Tests: 15 approval-flow tests with the scripted agent (blocking until decided, full, partial and rejected outcomes with the exact files and messages, `hunk_decisions` rows, incomplete and duplicate decisions, interrupts, new files, edits from current content, paths outside the worktree, failed simulations, no-op changes, conflicting edits during review, confirmations, always-allow, NotebookEdit fallback, policies tightened mid-session, expiry on restart), plus a review round trip over the real WebSocket.

## M5 — Visibility (2026-11-09)

- Tool renderer registry in `apps/web/src/features/tools`: `{ name, match, Summary, Detail }` renderers tried in order, ending in a generic catch-all. Renderers: `Read` (path, line range, highlighted content without the tool's line-number gutter), `Edit`/`Write` (the shared hunk view; read-only with each hunk's verdict and comment once decided, or a snippet diff when no review happened), `Bash`/`PowerShell` (command, description, stdout/stderr with ANSI colours), `Glob`/`Grep` (pattern, scope, result count and list), `Skill` (skill name and why it loaded), subagents (`Task`/`Agent`: type, task, report), MCP (`mcp__<server>__<tool>` as server and tool badges, highlighted JSON) and the generic fallback (highlighted JSON of input and output).
- Tool cards in the chat use the registry's one-line summary and expand to its detail view, with the human's verdict next to every call that needed one.
- Timeline tab next to Review: every tool call (Skill loads included) and every human decision in order, with call durations and how long the agent waited for each decision.
- A small ANSI parser (colours, bold, dim, underline; other escape sequences dropped) instead of a new dependency.
- Tests: ANSI parsing, the input/output helpers, registry routing for every MVP tool, and timeline ordering and wording.

## M6 — GitHub (2026-11-09)

- `GitHubToken`: `gh auth token` when the GitHub CLI is logged in, else `GITHUB_TOKEN`; looked up on demand (cached for a minute), held as `Redacted`, never stored.
- `GitHubService` on Effect `HttpClient` + `Schema` (only the fields used): `whoami`, `repos` (a `Stream` that follows `Link: rel="next"`), `listRepos`, `getRepo`, `listBranches`. Rate limits (`x-ratelimit-remaining: 0`, or 429) become `GitHubRateLimited` with the reset time; 401 and a missing token become `GitHubNotAuthenticated`; everything else `GitHubRequestFailed` with GitHub's message.
- `GitService.clone` streams git's `--progress` output line by line. `Projects.cloneFromGitHub` (a streaming RPC) checks the repository exists, refuses to overwrite an existing folder or project, clones into `<home>/repos/<owner>/<repo>` with the token passed as an HTTP header through `GIT_CONFIG_*` environment variables (never in argv or the clone's config), removes a partial clone on failure, and adds the result as a project.
- Web: "Clone from GitHub" on the home page (signed-in user, filterable repository list, clone by `owner/repo` or URL for public repositories, live progress, then straight to the new project); "On GitHub" branches on the project page. Sessions can start from any `origin/<branch>`, which covers "switch branch" without touching a checkout.
- Tests: the GitHub service against a mocked `HttpClient` (multi-page `Link` pagination, laziness, rate limiting, missing vs rejected token, 403, schema mismatches, unauthenticated public reads) and the clone flow end to end against a local repository (progress, project registration, remote branches present, token absent from `.git/config`, refusal to overwrite, cleanup after a failed clone, GitHub errors before any disk access).
- Smoke-tested against the real GitHub API with the local `gh` login (read-only: user, repository list, public branches) and a real clone of `octocat/Hello-World` into a throwaway directory.

## M7 — Polish (2026-11-09)

- Decision history per project (`Approvals.history`): every review and confirmation across the project's sessions, newest first, on the project page. A change still under review links straight to its hunk.
- Commit from the UI: a **Changes** tab in the workspace shows the session worktree's uncommitted diff with the shared diff view and commits it to the session branch (`Sessions.diff`, `Sessions.commit`). Commits are refused while the agent is working (`SessionBusy`) or when there is nothing to commit (`NothingToCommit`), and are noted in the transcript.
- "Always allow" from confirmation cards shipped in M4.
- README with requirements, setup, the review model, policies, configuration, the data directory and development commands.
- The daemon no longer logs every HTTP request: the RPC socket URL carries the auth token, which must not end up in logs.
- Verified the production build end to end: `npm run build` then the built daemon serves the web app (SPA routes included), accepts the token and rejects `/rpc` without it; the token appears in the output only in the printed link.
- Not done: creating pull requests (spec: "nice to have only if everything else is done").
