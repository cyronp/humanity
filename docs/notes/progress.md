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
