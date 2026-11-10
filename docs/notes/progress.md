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

## Claude account connection and onboarding (2026-11-10, between M2 and M3)

- Agent sessions are meant to run on the human's Claude subscription, the way T3 Code does it: Humanity runs the Claude Code CLI bundled with the Agent SDK, which signs in with the login from `claude auth login`. Humanity never holds the credential.
- Server: `ClaudeCode` service (bundled executable, config dir, a cleaned environment for the CLI, and an account probe through `initializationResult()` that sends nothing to Anthropic), `classifyAccount` (subscription / API key / cloud provider / signed out, including an API key that shadows the subscription), `ClaudeAccountService` (cached, refreshable) and the `Claude.status` RPC. The daemon banner prints the account it will run as.
- Web: first-run guide at `/welcome` in four steps (what Humanity is, how the pieces connect, the live Claude connection with sign-in instructions and auto-detection, what a session looks like), a Claude badge in the header and a help button to reopen it. The Claude icon goes in `apps/web/public/claude.svg`.
- Tests: the classifier on the observed account shapes, environment helpers, the service's caching and failure handling, `Claude.status` over the real WebSocket, and the UI summary helpers. Checked live against this machine's subscription and an empty config dir.
- Fix: `npm run dev` never started the daemon on Windows. `tsx watch` always reads stdin (for its "press Return to rerun"), and under turbo stdin is a pipe; the restarted child inherits that pipe and blocks inside Node's startup before any code runs, so no banner and no port. The server's `dev` script now uses Node's own watcher with the tsx loader (`node --watch --conditions=source --import tsx`), which reloads on changes in the server and in the workspace packages alike.
