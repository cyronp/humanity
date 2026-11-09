# Progress

## M0 — Scaffold (2026-11-09)

- npm workspaces + Turborepo with `dev`, `build`, `lint`, `typecheck`, `test` tasks run from the root.
- Four workspaces: `apps/server`, `apps/web`, `packages/contracts`, `packages/diff`. Each has a smoke test.
- TypeScript strict (plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESLint flat config, Prettier, Vitest.
- Workspace packages are consumed from source through a `source` export condition in dev and tests, and from `dist` in the production build.
- API verification written to `docs/notes/api-verification.md`. Notable: TypeScript is pinned to 6.0.3 because `typescript-eslint` does not support 7 yet.
