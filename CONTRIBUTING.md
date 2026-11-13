# Contributing

Thanks for helping. Humanity is MIT licensed; by contributing you agree your work is released under the same license.

## Setup

```sh
npm install
npm run dev
```

You need Node.js 22.13 or newer and git. See the [README](README.md) for the rest.

## Rules

- Use **npm** only, never pnpm or yarn.
- Pin every `effect` and `@effect/*` package to the **same exact version**.
- Do not swap a library from the stack in [`docs/spec.md`](docs/spec.md) without opening an issue first.
- Call the git CLI with argument arrays only, never shell-interpolated strings.
- Never use the SDK's `bypassPermissions` mode.
- Never write outside `~/.humanity/` or the folder a session works in.
- Never store API keys or tokens in the database.
- Tests must never call the real Anthropic, GitHub or GitLab APIs.

## Before you open a pull request

```sh
npm run lint
npm run typecheck
npm run test
```

All three must pass; CI runs them with `npm run build` on Node 22 and 24. Run `npm run format` to apply Prettier.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat(web): ...`, `fix(server): ...`, `chore: ...`).
- Keep a pull request focused on one change, and explain why it is needed.
- For anything larger than a small fix, open an issue first so we can agree on the approach.
