# Humanity

Humanity is a human-in-the-loop coding agent app: the agent proposes, the human approves each change hunk by hunk before it touches disk.

The full MVP specification is the source of truth for scope, stack and architecture:

@docs/spec.md

## Commands

Run everything from the repository root:

- `npm run dev` — start daemon and web app
- `npm run lint` — ESLint across the workspace
- `npm run typecheck` — TypeScript across the workspace
- `npm run test` — Vitest across the workspace
- `npm run build` — production build

Before considering any task done, `lint`, `typecheck` and `test` must all pass.

## Repository map

- `apps/server` — Effect 4 daemon (RPC, Agent SDK bridge, Git, GitHub, SQLite)
- `apps/web` — Vite + React 19 + TanStack Router + shadcn/ui
- `packages/contracts` — shared RpcGroups and Schemas
- `packages/diff` — pure hunk logic on top of jsdiff (no I/O)
- `docs/notes/` — `progress.md`, `decisions.md`, `api-verification.md`

## Hard rules

- Use **npm** only. Never pnpm or yarn.
- Pin every `effect` and `@effect/*` package to the **same exact version**. Use the import paths the installed version actually exports; don't copy beta-era `effect/unstable/*` paths from examples without checking.
- Never substitute a library from the spec's stack without asking.
- Call the git CLI with argument arrays only, never shell-interpolated strings.
- Never use the SDK's `bypassPermissions` mode. Unknown tools default to `confirm`.
- Never write outside `~/.humanity/` or a session's worktree.
- Never store API keys or tokens in the database.

## Workflow

- Work one milestone at a time, in the order of the spec. Commit at the end of each one.
- After each milestone, append a short summary to `docs/notes/progress.md`.
- When the spec and the real API disagree, follow the real API and record the deviation in `docs/notes/api-verification.md`.
- When a decision isn't covered by the spec, **stop and ask** instead of guessing. Record the answer in `docs/notes/decisions.md`.
