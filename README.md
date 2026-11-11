# Humanity

A coding agent built around one rule: **human in the loop, not AI in the loop.**

The agent (Claude, through the Claude Agent SDK) proposes; you decide, change by change, while it works. Every file edit is split into hunks that you approve, reject with a comment, or partly approve before anything touches disk. Shell commands and MCP tools wait for an explicit allow. Each session runs in its own git worktree and branch, so the agent never works in your checkout.

## Requirements

- **Node.js 22.13 or newer** (24 LTS recommended). The database uses Node's built-in `node:sqlite`; Node prints an "experimental" warning for it, which is harmless.
- **git** on your `PATH`.
- **A Claude login.** Run `claude auth login` once with your Claude Pro, Max, Team or Enterprise account (or the bundled CLI's own `auth login` command, shown in the first-run guide). An `ANTHROPIC_API_KEY` in the environment also works, but Claude Code then bills that key instead of your plan.
- Optional, for GitHub: the [GitHub CLI](https://cli.github.com/) logged in (`gh auth login`), or a `GITHUB_TOKEN`. A [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with read access to _Contents_ and _Metadata_ of the repositories you want is enough. Public repositories can be cloned without any token.

## Getting started

```sh
npm install
claude auth login   # once, if you are not signed in to Claude Code yet
npm run dev
```

`npm run dev` starts the daemon and the web app. The daemon prints a link like:

```
  Open Humanity:  http://127.0.0.1:5173/?token=…
```

Open it. The token is kept by the browser; without it the daemon refuses connections. It is also stored in `~/.humanity/auth-token` if you need to paste it again.

The daemon also prints which Claude account the agent will run as. The first visit opens a short setup guide at `/welcome` that shows the same connection live.

Then:

1. **Add a project.** Point Humanity at a local git repository, or clone one from GitHub (your repositories are listed when `gh` or `GITHUB_TOKEN` is available; any public `owner/repo` works by name).
2. **Start a session** from the project page. Pick the branch to start from (local or `origin/…`) and write a first message. Humanity creates a branch `humanity/<id>-<title>` and a worktree for it.
3. **Work with the agent.** It reads freely. When it wants to change a file, the review panel opens; when it wants to run a command, a card appears above the message box. The session status turns to **waiting for you** until you decide.
4. **Commit** what you approved from the **Changes** tab. Commits go to the session branch only.

### Reviewing changes

Each hunk has **Approve** and **Reject** buttons and a comment field. A change is submitted all at once, after every hunk has a verdict:

| Outcome       | What happens on disk                    | What the agent is told                                                                                                               |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| All approved  | The agent's tool applies the change     | Nothing special: the edit succeeded                                                                                                  |
| All rejected  | Nothing                                 | `REJECTED by the human reviewer…` with your comment for each hunk                                                                    |
| Some approved | Humanity writes only the approved hunks | `PARTIALLY APPLIED by the human reviewer…`: which hunks were applied, which were rejected and why, and that it must re-read the file |

Keyboard shortcuts in the review panel: `j` / `k` next / previous hunk, `a` approve, `r` reject, `c` comment, `Enter` submit (`Ctrl+Enter` from inside a comment, `Esc` to leave it). Links of the form `…/sessions/<id>?file=src/app.ts&hunk=2` open a specific hunk.

### Tool policies

Each project has a policy (on the project page) that gives every tool one of four modes:

| Mode      | Meaning                | Default for                                                                          |
| --------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `auto`    | Runs without asking    | `Read`, `Glob`, `Grep`, `TodoWrite`, `Skill`                                         |
| `review`  | Hunk-by-hunk review    | `Edit`, `Write`, `NotebookEdit` (shown as an allow/deny card)                        |
| `confirm` | Allow or deny the call | `Bash`, `PowerShell`, `WebFetch`, `WebSearch`, `mcp__*`, **and any tool not listed** |
| `deny`    | Never runs             | nothing                                                                              |

Rules are exact tool names or prefixes ending in `*` (for example `mcp__github__*`). Changes apply immediately, also to agents that are already running. "Always allow" on a confirmation card sets that tool to `auto` for the project.

The agent loads the repository's own `CLAUDE.md`, skills and `.claude/settings.json`, but a settings file can never pre-approve a tool that the policy routes to you.

## Running it for real

```sh
npm run build
npm start          # serves the web app and the API on http://127.0.0.1:7420
```

| Variable            | Default       | Purpose                                     |
| ------------------- | ------------- | ------------------------------------------- |
| `ANTHROPIC_API_KEY` | (none)        | Optional. Overrides your Claude login       |
| `HUMANITY_HOME`     | `~/.humanity` | Data directory                              |
| `HUMANITY_PORT`     | `7420`        | Daemon port. It always binds to `127.0.0.1` |
| `GITHUB_TOKEN`      | (none)        | Used when `gh` is not logged in             |

Everything Humanity writes lives in the data directory:

```
~/.humanity/
├─ humanity.db                       projects, sessions, messages, tool calls, decisions
├─ auth-token                        the daemon's access token
├─ worktrees/<project>/<session>/    one git worktree per session
└─ repos/<owner>/<repo>/             clones made from GitHub
```

Claude Code itself keeps its login and its session transcripts (used to resume sessions) in its own config directory, `~/.claude` or `CLAUDE_CONFIG_DIR`, as it does for your terminal sessions. Humanity never reads or stores your Claude credentials.

API keys and tokens are never stored in the database. The GitHub token is passed to `git clone` only as a header for that one process, so it never ends up in a clone's configuration.

## Development

```sh
npm run dev         # daemon (tsx watch) + Vite dev server
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm run test        # Vitest; never calls the Anthropic or GitHub APIs
npm run build       # production build
npm run format      # Prettier
```

| Path                 | What it is                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/server`        | The Effect 4 daemon: RPC over WebSocket, the Agent SDK bridge, approvals, git, GitHub, SQLite     |
| `apps/web`           | Vite + React 19 + TanStack Router + shadcn/ui, data through Effect Atom (`AtomRpc`)               |
| `packages/contracts` | Schemas and RPC groups shared by both                                                             |
| `packages/diff`      | Pure hunk logic on top of jsdiff: splitting, partial application, tool simulation, agent messages |
| `docs/spec.md`       | The MVP specification                                                                             |
