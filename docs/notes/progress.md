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
