# Humanity

An app for running coding agents in threads, with you in charge of how much each one does on its own.

The agent (Claude, through the Claude Agent SDK) works on its own by default: it reads, edits files and runs commands without stopping, and every call it makes is shown as it happens. Any thread can instead ask first, so that file changes and commands wait for you to allow or deny them. A thread starts in your checkout and can be moved into its own git worktree and branch.

## Requirements

- **Node.js 22.13 or newer** (24 LTS recommended). The database uses Node's built-in `node:sqlite`; Node prints an "experimental" warning for it, which is harmless.
- **git** on your `PATH`.
- **A Claude login.** Run `claude auth login` once with your Claude Pro, Max, Team or Enterprise account (or the bundled CLI's own `auth login` command, shown in the first-run guide). An `ANTHROPIC_API_KEY` in the environment also works, but Claude Code then bills that key instead of your plan.
- Optional, for GitHub: the [GitHub CLI](https://cli.github.com/) logged in (`gh auth login`), a token saved in Humanity (Settings, under Repositories, or the first-run guide), or a `GITHUB_TOKEN`. A [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with read access to _Contents_ and _Metadata_ of the repositories you want is enough. Public repositories can be cloned without any token.
- Optional, for GitLab (gitlab.com or a self-hosted instance): the [GitLab CLI](https://gitlab.com/gitlab-org/cli) logged in (`glab auth login`), a token saved in Humanity together with the instance's host (Settings, under Repositories), or a `GITLAB_TOKEN` (with `GITLAB_HOST` for an instance of your own). A personal access token with the `read_api` and `read_repository` scopes is enough. The token is only ever sent to its own instance, over https.

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

1. **Add a repository** from the project menu in the header. Your GitHub and GitLab repositories are listed once those accounts are connected; pick one and Humanity clones it. Typing a public `owner/repo`, a GitHub or GitLab URL or the path of a local git repository adds that instead.
2. **Start a thread** from the home page. Pick the branch your checkout should be on (local or `origin/…`), the permissions, and write a first message. The thread works in your checkout; **Set up worktree** in its header moves it into a branch `humanity/<id>-<title>` and a worktree of its own.
3. **Work with the agent.** It runs on its own unless the thread is set to ask. In a thread that asks, a file change opens the review panel and a command shows a card above the message box; the session status turns to **waiting for you** until you decide.
4. **Commit** the work from the **Changes** tab.

### Permissions

Each thread has one of three modes, chosen next to the message box and changeable while the agent works:

| Mode             | What waits for you                                                               |
| ---------------- | -------------------------------------------------------------------------------- |
| **Auto mode**    | Nothing, except a question the agent asks you. The default for new threads       |
| **Accept edits** | Commands, web and MCP tools. File changes inside the thread's folder are applied |
| **Ask me**       | File changes and commands, web and MCP tools                                     |

Reads (`Read`, `Glob`, `Grep`), the agent's own bookkeeping (`TodoWrite`, `Skill`) and opening a new thread never ask, in any mode.

A new thread starts in its project's mode (Settings, under Projects), else the mode you pinned in the message box's permissions menu, else Auto mode. Threads that already exist keep theirs.

### Answering a request

A file change is shown as a diff in the review panel; a command or tool call as a card above the message box. Both take the same answer:

| Answer                          | What happens                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| **Allow**                       | The agent's tool runs                                                              |
| **Always allow in this thread** | The tool runs, and that tool stops asking in this thread until the daemon restarts |
| **Deny**                        | Nothing runs or is written; the agent is told, with your comment if you wrote one  |

Keyboard shortcuts in the review panel: `a` allow, `d` deny, `c` comment (`Esc` to leave it). A link of the form `…/sessions/<id>?file=src/app.ts` opens the change to that file.

The agent loads your Claude Code user settings and the repository's own `CLAUDE.md`, skills and `.claude/settings.json`, but a settings file can never pre-approve a tool on Humanity's behalf: the thread's mode decides.

## Running it for real

```sh
npm run build
npm start          # serves the web app and the API on http://127.0.0.1:7420
```

| Variable            | Default       | Purpose                                               |
| ------------------- | ------------- | ----------------------------------------------------- |
| `ANTHROPIC_API_KEY` | (none)        | Optional. Overrides your Claude login                 |
| `HUMANITY_HOME`     | `~/.humanity` | Data directory                                        |
| `HUMANITY_PORT`     | `7420`        | Daemon port. It always binds to `127.0.0.1`           |
| `GITHUB_TOKEN`      | (none)        | Used when no token is saved and `gh` is not logged in |
| `GITLAB_TOKEN`      | (none)        | The same for GitLab and `glab`                        |
| `GITLAB_HOST`       | `gitlab.com`  | The GitLab instance `GITLAB_TOKEN` is for             |

Everything Humanity writes lives in the data directory:

```
~/.humanity/
├─ humanity.db                       projects, sessions, messages, tool calls, decisions
├─ auth-token                        the daemon's access token
├─ github-token                      a GitHub token saved from the UI, only while one is saved
├─ gitlab-token, gitlab-host         the same for GitLab, with the instance the token is for
├─ worktrees/<project>/<session>/    one git worktree per session
└─ repos/<owner>/<repo>/             clones made from GitHub
   repos/<host>/<group>/<repo>/      clones made from GitLab
```

Claude Code itself keeps its login and its session transcripts (used to resume sessions) in its own config directory, `~/.claude` or `CLAUDE_CONFIG_DIR`, as it does for your terminal sessions. Humanity never reads or stores your Claude credentials.

API keys and tokens are never stored in the database. The GitHub or GitLab token is passed to `git clone` only as a header for that one process, so it never ends up in a clone's configuration.

## Development

```sh
npm run dev         # daemon (tsx watch) + Vite dev server
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm run test        # Vitest; never calls the Anthropic or GitHub APIs
npm run build       # production build
npm run format      # Prettier
```

| Path                 | What it is                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `apps/server`        | The Effect 4 daemon: RPC over WebSocket, the Agent SDK bridge, approvals, git, GitHub, SQLite |
| `apps/web`           | Vite + React 19 + TanStack Router + shadcn/ui, data through Effect Atom (`AtomRpc`)           |
| `packages/contracts` | Schemas and RPC groups shared by both                                                         |
| `packages/diff`      | Pure hunk logic on top of jsdiff: splitting, parsing, tool simulation                         |
| `docs/spec.md`       | The MVP specification                                                                         |
