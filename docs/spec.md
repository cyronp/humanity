# Humanity — MVP Specification

> This document is the brief for building the MVP of **Humanity**. Read it fully before writing code. Work milestone by milestone, and stop to ask the human whenever a decision is ambiguous or not covered here. That habit is the product's philosophy, so practice it while building it.

## Amendment: autonomy first (2026-11-12)

The product pivoted away from mandatory human approval. Where this section and the rest of this document disagree, this section wins.

- **Threads run on their own by default.** A new thread starts in Auto mode: edits, commands, web and MCP tools run without asking. The premise in section 1 ("every file mutation is reviewed before it touches disk") no longer holds.
- **Asking first is a mode of a thread**, not the product's rule. The modes are "Ask me", "Accept edits" and "Auto mode". A new thread takes its project's default (Settings, under Projects), else the mode the human pinned for every project, else Auto mode. It never inherits the mode of another thread. The mode can be changed while the agent works.
- **A request is answered as a whole.** A file change (shown as a diff) and any other tool call take the same answer: Allow, Always allow in this thread, or Deny with an optional comment. There are no per-hunk decisions and no partial application. This supersedes section 5.3, the `hunk_decisions` table, the hunk-applying and agent-message parts of `packages/diff`, the per-hunk payload of `Approvals.decideChange`, the `j`/`k`/`r`/`Enter` review shortcuts and `?hunk=` deep links.
- **There is no per-project tool policy.** What a tool is (a read, a file change, anything else) is fixed in `packages/contracts`; only the thread's mode decides what asks. This supersedes section 5.1, `PolicyService`, `Projects.getPolicy`/`setPolicy` and the `deny` mode. "Always allow" is scoped to the thread and kept in memory.
- **Unchanged:** never `bypassPermissions`; every call that is not a read still reaches `canUseTool`, so settings files cannot pre-approve a tool; a tool Humanity does not know asks in a thread that asks; a question from the agent always reaches the human; every tool call is rendered; worktree isolation is one click away.

## Amendment: desktop app (2026-11-13)

Humanity also ships as a desktop app. This adds to the stack of section 3 and to the layout of section 4; nothing else changes.

- **Stack additions:** Electron (the shell), electron-builder (the installer) and esbuild (bundles the shell's main process and the daemon it ships). They are used by `apps/desktop` only.
- **`apps/desktop` is a shell, not a second app.** It starts the daemon of `apps/server` as a child process, on Electron's own Node (`ELECTRON_RUN_AS_NODE`), and opens a window on the web app that daemon serves. It holds no domain logic, no RPC handlers and no copy of the UI. The daemon is never run inside Electron's main process.
- **The window is an ordinary client.** It loads `http://127.0.0.1:<port>/?token=…` like a browser would, sandboxed, with context isolation, no Node integration and no preload. Links that leave Humanity open in the human's browser.
- **The app's top bar is the window's title bar.** On Windows and Linux the window has no title bar of the system's: the web app's own bars along the top move the window, and the system's minimize, maximize and close buttons are drawn over their right end, in the page's theme (the page states it in its `theme-color`). This is plain CSS in `apps/web` that does nothing in a browser. macOS keeps its title bar for now. The app's icon is the brand mark, drawn from the favicon by `apps/desktop/scripts/icon.mjs`.
- **A port of its own, always the same:** 7421 (`HUMANITY_DESKTOP_PORT`), apart from the daemon's 7420. It is fixed because the web app keeps its token and preferences in localStorage, which belongs to the origin. Only one instance of the app runs at a time.
- **The daemon lives and dies with the app.** The app keeps the daemon's stdin open; when it closes, because the app quit or crashed, the daemon shuts down. A daemon that dies is restarted, and the web app reconnects on its own.
- **Packaging:** the daemon is bundled into one file and shipped beside the app's archive together with the web app and the Agent SDK with its Claude Code executable, which need real paths on disk. An installer is built on, and for, one platform. The first target is an unsigned Windows installer; code signing, notarization, auto-update, macOS and Linux come later.
- **Writes stay inside `~/.humanity/`:** Chromium's profile is kept in `~/.humanity/desktop/`.

## Amendment: Codex (2026-11-15)

Threads can run on OpenAI's Codex as well as on Claude Code. This adds to the stack of section 3 and to the services of section 8; the rules of "Autonomy first" hold for both.

- **Stack addition:** `@openai/codex` (the Codex CLI, pinned to an exact version), used by `apps/server` only. Humanity speaks to `codex app-server` over its standard input and output (JSON, one message per line), started with Effect `ChildProcess`. It does not use `@openai/codex-sdk`: that SDK runs `codex exec`, which has no way to ask the client before a command or a file change, so Humanity's permission check could not decide them.
- **A thread has a provider, for good.** `Session.provider` is `claude-code` or `codex`; the model picked for a new thread decides it, and an open thread only changes model within its provider. `sdkSessionId` holds the Codex thread id, used to resume.
- **Every call that is not a read still reaches Humanity's permission check.** A Codex thread always runs with the approval policy `untrusted` and Humanity as the reviewer, whatever the human's own Codex settings say, and never with `never`, which is to Codex what `bypassPermissions` is to the Agent SDK. Codex's sandbox is off (`danger-full-access`): what Humanity allowed runs as it does for Claude Code, and what it did not allow does not run.
- **Codex's actions under Humanity's names.** A command is `Bash`; a file change is `ApplyPatch`, one patch over one or more files, a file change to the thread's mode (so "Accept edits" applies it) that is shown as its diffs and allowed or denied as a whole, never when a file is outside the session's folder; an MCP tool is `mcp__<server>__<tool>`; a question is `AskUserQuestion`. Codex's answer to a declined call carries no message, so the human's comment follows as a message to the running turn.
- **Accounts, like every provider.** A provider has a default login, its CLI's own (for Codex `CODEX_HOME`, else `~/.codex`), and any number of added accounts, each a config folder of that CLI: one Humanity makes under `~/.humanity/` (`accounts/` for Claude Code, `codex-accounts/` for Codex) or one the human already has. Humanity stores the name and the path, never the credential. One account per provider is the active one, which new threads of that provider run as; a thread keeps its account for good (`sessions.account_id`, `NULL` for the default login). `Codex.status` reports the active account and the models it offers, like `Claude.status`, and `Codex.accounts`, `addAccount`, `removeAccount` and `setActiveAccount` mirror Claude's. A provider added later gets its accounts the same way (`accountRegistry.ts` in `apps/server`).
- **Not yet on Codex:** Humanity's skills (given to Claude Code through the Agent SDK), PDF attachments (refused with a message), importing Codex's own history, and changing MCP servers of a thread that is already running.

## Amendment: ACP agents (2026-11-16)

Humanity can run agents that speak the Agent Client Protocol (ACP, https://agentclientprotocol.com), the way it runs Codex: as a process it starts and speaks to over standard input and output. This adds to the services of section 8 and no library to the stack of section 3; the rules of "Autonomy first" hold for every agent.

- **No SDK.** Humanity has its own ACP client in `apps/server/src/acp`, on Effect `ChildProcess`: JSON-RPC 2.0, one message per line, protocol version 1. It does not use `@agentclientprotocol/sdk`.
- **A client that lends nothing.** Humanity offers the agent neither its file system nor a terminal (`fs` and `terminal` are off in `initialize`), so the agent works with its own tools and asks before it uses them.
- **Humanity decides what the agent asks about, and only that.** `session/request_permission` reaches Humanity's permission check, where the thread's mode decides. The protocol has nothing like `untrusted` to force a question, so each agent is started with whatever settings of its own make it ask before every call that is not a read, and never with one that lets it decide alone. An agent that cannot be made to ask is not added.
- **Allowed once, never always.** Humanity answers with the agent's `allow_once` or `reject_once`. An agent's `allow_always` is a rule it keeps for itself, beyond the thread, so Humanity never picks it; when it is the only way to allow, the call does not run. "Always allow in this thread" stays Humanity's own, in memory.
- **An agent's actions under Humanity's names.** By the kind the agent gives a call: `execute` is `Bash`; `edit`, `delete` and `move` that show their diffs are `ApplyPatch`, a file change to the thread's mode and never outside the session's folder; `read` is `Read` and `search` is `Grep`. Anything else keeps the agent's own name, which no thread pre-approves, including a file change that shows no diff.
- **A declined call carries no message**, as on Codex. Where the agent can be told something while its turn runs, the human's comment follows at once; where it cannot, the agent reads it with the human's next message.
- **Sessions.** `sdkSessionId` holds the ACP session id. A thread is reopened with `session/resume` where the agent has it, else `session/load`, whose replay of the history Humanity ignores. The model and the reasoning effort are options of the session (`session/set_config_option`), set before a turn.
- **Kiro (Beta).** The first agent on this layer is Kiro, a provider of its own (`kiro`). Humanity starts `kiro-cli acp --agent-engine=v3 --auth-method=cli` from the PATH: V3 because Kiro's default engine is V2, and the CLI's own login. Its accounts are `KIRO_HOME` folders (`kiro-accounts/` under the data directory, or one the human already has), kept like Codex's. A Kiro session starts with its `autopilot` setting on, so Humanity sets it to `off` (Supervised) before the first prompt, and a session that lists the setting and will not take it does not run; `autopilot` is never set to `on`. Supervised, Kiro also asks once more when a turn ends, about the files the turn changed: Humanity accepts that review itself when it allowed every one of those changes, and asks the human when one of them never reached it. Kiro's own saved rules (`permissions.yaml`) can allow a call before it asks, and the protocol gives Humanity no way to turn that off, so the provider stays Beta until a live Kiro session confirms that every non-read call reaches `session/request_permission`. Kiro shows a file change's diff only after it was allowed, so Humanity builds the `ApplyPatch` it asks about from the file and the content Kiro names before that. A declined call's comment follows at once, with Kiro's `_session/steer`. What a sub-agent does is shown under the call that started it. Kiro reports no plan limits here. A session lists its models only once it runs on one, so the model list and the sign-in are read from the CLI (`kiro-cli chat --list-models`, `kiro-cli whoami`), which opens no session.
- **Not yet on ACP agents:** Humanity's skills, PDF attachments, images for an agent that does not take them, and changing MCP servers of a thread that is already running.

## Amendment: Humanity's tools on every provider (2026-11-16)

Humanity's own MCP server (`humanity`, with `open_thread`) reaches the agent of every provider, and a thread can open one on another provider. This changes the services of section 8 and adds no library to the stack of section 3.

- **Served by the daemon, over HTTP.** The server speaks MCP's Streamable HTTP transport at `/mcp` on the daemon's own address (`127.0.0.1`): one JSON-RPC message per POST, answered with plain JSON, with no stream and no session. Each running thread's agent is given it as one more MCP server, with a bearer token of its own that names the thread. The token is not the daemon's: it opens no socket and reaches nothing but these tools, for that thread only. It lives in memory while the thread's agent runs and is never stored. A provider added later gets Humanity's tools by passing on the MCP servers it is given, as it must anyway; an ACP agent that cannot reach an MCP server over HTTP does not get them.
- **`open_thread` takes a provider.** `provider` (`claude-code`, `codex`, `kiro`) is left out for the opening thread's own. The model is checked against what that provider offers its active account, and refused with the list of those it does; a provider nobody is signed in to opens no thread. The new thread runs as that provider's active account, in its project's default autonomy, like any new thread.
- **Under one name everywhere.** The call is `mcp__humanity__open_thread` on every provider and still runs without asking in every thread. Codex asks about an MCP call by its server alone, so it is configured to approve that one tool of the `humanity` server itself. Kiro titles an MCP call `@<server>/<tool>`; Humanity names it `mcp__<server>__<tool>` when Kiro names the server too.

## Amendment: the human's own CLIs (2026-11-17)

Humanity ships no agent. Every provider runs on the CLI the human installed and signed in to, the same one they use in a terminal. This supersedes the parts of "Desktop app" and "Codex" that bundle the Claude Code and Codex executables and pin Codex to an exact version.

- **Found, not shipped.** The daemon looks for `claude`, `codex` and `kiro-cli` on the PATH, then in the folders their installers use (`~/.local/bin`, npm's global folder, Kiro's own), every time a thread or a check starts one, so a CLI installed or updated while Humanity runs is picked up without a restart. A Windows npm shim (`.cmd`) is read for the script or executable it runs, because it cannot be spawned without a shell. Claude Code is always given to the Agent SDK by path (`pathToClaudeCodeExecutable`), never the copy the SDK may find in `node_modules`; this holds in development too. The same `apps/server/src/agent/installedCli.ts` serves a provider added later.
- **A tested minimum, not a pin.** Each provider has the oldest CLI version Humanity is tested against (`CLI_MINIMUM_VERSIONS` in `packages/contracts`): for Claude Code the `claudeCodeVersion` of the Agent SDK Humanity is built with, for Codex the version its app-server protocol was written against, for Kiro 3.0.0, the first whose ACP agent Humanity speaks to. An older CLI still runs threads; Settings and the model picker say it may not work properly and ask the human to update it. A missing CLI links to its install guide.
- **Updating is the human's click.** Each provider's header in Settings has an Update button that runs the CLI's own updater (`claude update`, `codex update`, `kiro-cli update`), which updates it where and how it was installed. It is the one thing Humanity starts that writes outside `~/.humanity/` and the session's folder, and it only ever runs when the human asks.
- **Packaging:** the desktop app ships the daemon, the web app and the Agent SDK's JavaScript, without its platform executables; `@openai/codex` is no longer a dependency. The installer no longer carries ~300 MB of agent executables.
- **Unchanged:** every rule of "Autonomy first" and of each provider's amendment about permissions, accounts and sessions.

## Amendment: the shelf, Sync, a shared terminal and a preview (2026-11-17)

A thread's tools live on a shelf along its right edge, and the terminal and the preview join them. This adds to the stack of section 3 and replaces the right panel of section 10. The shelf and Sync are built; the terminal and the preview are the next milestone and ship together.

- **Stack additions:** `@xterm/xterm` and `@xterm/addon-fit` (the terminal's view, `apps/web` only) and `node-pty` (the terminal's process, `apps/server` only).
- **The shelf.** A rail of tool icons, full height, along the thread's right edge, and the open tool's panel in its own space between the chat and the rail. Clicking an icon opens its tool, clicking it again closes the panel. Icons carry badges (changed files, commits to push) so a tool rarely needs opening to be read. Every tool works on the thread's folder and branch. Which tool was open, and whether, is remembered in the browser.
- **Sync.** One button fetches `origin`, brings the thread's branch up to date with its upstream (else `origin/<default branch>`), and pushes to an upstream of the same name. It fast-forwards, or rebases the branch's own commits on top when the folder has no uncommitted changes to tracked files; a conflict aborts the rebase. It never leaves the folder half-changed and waits while any thread in that folder is running. When commits come in, the agent's next message names the files that changed on disk. A thread that is open fetches in the background at most once a minute per repository, and a background fetch never opens a credential helper's window.
- **One terminal per thread, shared by the human and the agent.** The daemon runs it with `node-pty`, in the thread's folder, with the human's shell and environment minus anything of Humanity's (its token never). It outlives a page reload, replaying what it printed, and stops when the thread ends or the daemon stops. The human types into it freely: those are the human's own keystrokes, not tool calls, and they reach no permission check, like the human's own terminal. The agent uses the same terminal through Humanity's MCP server, on every provider: reading what it shows is a read; sending input to it is a command, which the thread's mode decides exactly like `Bash`, so an agent never gets through the terminal what it would not get through `Bash`. Each sees what the other did.
- **A localhost preview**, shipped with the terminal. A Browser tool on the shelf shows a page of `localhost`, `127.0.0.1` or `[::1]` in an iframe, with reload and "Open in my browser". Humanity's own ports are refused, so a framed Humanity can never read its token. When the terminal or a `Bash` call prints a local address, the Browser icon offers it. A full browser (any site, devtools) would need logic in the desktop shell and waits for a decision of its own.
- **Packaging:** `node-pty` is native, so the desktop app ships it rebuilt for Electron's Node beside the bundled daemon.
- **Unchanged:** never `bypassPermissions`; every call of the agent that is not a read reaches the permission check; nothing of Humanity's writes outside `~/.humanity/` or the session's folder.

## Amendment: terminals in a dock (2026-11-18)

The terminal grows from one per thread into tabs in a dock under the chat, modelled on Orca's. Where this section and the shelf amendment above disagree, this section wins; the preview is unchanged and follows the terminal.

- **Stack additions:** `@xterm/headless` and `@xterm/addon-serialize` (`apps/server`: each terminal's screen, for replay and for the agent's reads), and `@xterm/addon-search`, `@xterm/addon-web-links`, `@xterm/addon-unicode11` and `@xterm/addon-webgl` (`apps/web`; Unicode11 also in `apps/server`, so both sides measure characters alike).
- **Two buttons, always at the top right of a thread and of the new-thread page.** One (panel-bottom) opens and closes the terminal dock, the other (panel-right) shows and hides the shelf's rail with its open panel. Both are remembered in the browser. Outside a thread the rail shows its tools disabled, since each works on a thread's folder and branch.
- **Terminals outside a thread belong to the project.** On the new-thread page the dock shows the selected project's own terminals, opened in its checkout; before any project was added, the human's own, opened in their home folder. Starting a thread leaves them where they are: the thread starts with a dock of its own. Removing the project closes its terminals. They are the human's keystrokes like any terminal's, and no agent ever reaches them: the agent's terminal tools only see its own thread's.
- **Any number of terminals per thread, as tabs.** No splits. A new terminal starts in the thread's folder with the human's shell: on Windows `pwsh`, else `powershell.exe`; elsewhere `$SHELL` as a login shell. Settings, under Terminal, picks another shell found on the machine, the font size and the scrollback. The dock's height is dragged like the panels' widths. Each tab shows its folder, whether a command runs, and who opened it. The dock's bar hides it and leaves its terminals running; its X closes every terminal of the thread, stopping what runs in them, and the dock with them.
- **The daemon owns every terminal.** A `node-pty` process and a headless xterm per terminal; a browser attaches to it, gets the screen as it is, then what follows. The human's keystrokes reach no permission check. A terminal outlives a page reload with its process. When the daemon stops, each terminal's screen is saved under `~/.humanity/terminals/`; when it starts again, the tab comes back with that screen and a fresh shell in its last folder (its process does not survive). Ending a thread closes its terminals and deletes what was saved.
- **Shell integration.** Humanity starts PowerShell, bash (Git Bash too), zsh and fish with a script of its own, kept under `~/.humanity/`, that loads the human's own startup files and marks each command's start, its end with the exit code (OSC 133) and the folder (OSC 7). `cmd` gets none. It tells the human which tab is busy and lets the agent wait for a command to finish.
- **Setting up a worktree** restarts the thread's idle terminals in the worktree, keeping what they showed; a terminal that is running something keeps running in the checkout and says so.
- **The agent's terminal tools,** on Humanity's MCP server, on every provider: `terminal_list`, `terminal_read` (what a terminal printed since a cursor, or its screen), `terminal_send` (text and keys), `terminal_wait` (for the command to finish, for a pattern, or for quiet), `terminal_open` (a new tab, optionally running a command) and `terminal_close`. Reading and waiting are reads. Sending, opening with a command and closing a terminal the agent did not open are commands: Humanity's own handler decides them as `Bash`, with the command the agent typed, in the thread's mode, before anything reaches the terminal. The providers pass these six tools through to that handler (Codex asks about an MCP call without its name or arguments, so the human could not see what would be typed); "Always allow" of `Bash` in a thread covers them too.
- **Packaging:** `node-pty` 1.1 is built on Node-API and ships prebuilt binaries for Windows and macOS, which load on Electron's Node as they are; the desktop app copies the binaries of its own platform beside the bundled daemon, without rebuilding them. This supersedes "rebuilt for Electron's Node" above.

## 1. Product vision

Humanity is a coding agent app, similar in spirit to Claude Code or Codex, built around one premise: **human in the loop, not AI in the loop**.

Existing tools optimize for autonomy: the agent edits freely and the human reviews a large diff at the end, if at all. Humanity inverts that. The agent proposes, the human decides, change by change, while the work is happening.

Core principles:

1. **Every file mutation is reviewed before it touches disk.** The agent's edits are intercepted, split into hunks and shown to the human, who approves, rejects or comments on each hunk.
2. **Rejections are conversations.** A rejection carries a comment that goes back to the agent as feedback, so it can correct course.
3. **Autonomy is configured per action type, not globally.** Reads are automatic, edits are reviewed, shell commands are confirmed.
4. **Everything the agent does is visible.** Tool calls (including MCP tools and Skills) are rendered as first-class, readable objects, not raw logs.
5. **Isolation is one click away.** A session starts in the project's checkout. The human can move it into its own git worktree and `humanity/…` branch at any time between turns.

## 2. MVP scope

### In scope

- Add a project from a local git repository path, or by cloning a GitHub repository.
- List, create and switch branches; a session works in the project's checkout until the human sets up a worktree for it.
- Chat with the agent (Claude Agent SDK) with streamed, markdown-rendered responses.
- Intercept file-mutating tools and route them through a hunk-by-hunk review UI.
- Approve, reject (with comment) or partially approve proposed changes.
- Confirm or deny shell commands and MCP tool calls before they run.
- Render tool calls with custom renderers per tool, plus a generic JSON fallback.
- Session timeline showing tool calls, loaded Skills and approval decisions.
- Persist projects, sessions, messages, tool calls and decisions in SQLite; resume sessions.

### Out of scope (post-MVP)

- Editing a hunk's code before approving it (planned with CodeMirror 6). **Design the hunk model so this can be added later without rewriting the flow** (see section 6).
- Interactive terminal in the UI (planned with xterm.js + node-pty).
- Remote access (Tailscale or Cloudflare Tunnel, undecided). The daemon binds to `127.0.0.1` only in the MVP.
- GitHub App / OAuth. The MVP uses a personal token.
- Creating pull requests (nice to have only if everything else is done).
- Multi-user support.

## 3. Tech stack (decided — do not substitute)

| Area | Choice |
|---|---|
| Package manager / monorepo | **npm workspaces** + **Turborepo** (do not use pnpm or yarn) |
| Language | TypeScript (strict) everywhere |
| Runtime | Node.js current LTS (>= 22) |
| Agent | `@anthropic-ai/claude-agent-sdk` (TypeScript) |
| Server / daemon | **Effect 4**: RPC over WebSocket, HTTP server via `@effect/platform-node` |
| Process execution | Effect `ChildProcess` (git CLI is called directly; no `simple-git`) |
| GitHub API | Effect `HttpClient` + Effect `Schema` (no Octokit) |
| Persistence | SQLite via Effect SQL + the Effect SQLite Node driver (`@effect/sql-sqlite-node`), migrations with Effect's `Migrator` |
| Frontend build | Vite |
| UI framework | React 19 |
| Routing | TanStack Router (file-based routes via the Vite plugin) |
| Client state / data | Effect Atom: `AtomRpc` + `@effect/atom-react` |
| Styling / components | Tailwind CSS + shadcn/ui |
| Diff computation | `diff` (jsdiff): `structuredPatch`, `applyPatch`, `parsePatch` |
| Syntax highlighting | Shiki (dual light/dark themes) |
| Chat markdown | Streamdown |
| Tests | Vitest + `@effect/vitest` |
| Lint / format | ESLint (flat config, typescript-eslint, react-hooks plugin) + Prettier |

### Version rules

- **Effect 4 is stable, but some modules are tagged `@stability unstable`** and may break in minor releases. All `effect` and `@effect/*` packages share one version number: pin **every** Effect package to the **same exact version** (no `^` or `~`).
- In Effect 4, most former packages (`@effect/platform`, `@effect/rpc`, `@effect/sql`, etc.) are merged into `effect` and imported as `effect/<area>` (e.g. `effect/rpc`, `effect/sql`, `effect/reactivity`). Separate packages remain only for platforms (`@effect/platform-node`), SQL drivers (`@effect/sql-sqlite-node`), framework bindings (`@effect/atom-react`) and tooling (`@effect/vitest`).
- Many online examples use beta-era paths like `effect/unstable/rpc`. **Use whatever paths the installed version actually exports** — check the package's `exports` field and the v4 docs, don't guess.
- Do **not** use the old `@effect-atom/*` packages; they target Effect 3.
- `@effect/atom-react` requires React 19.

### Verify before coding

Before Milestone 1, check the current docs for:

- Claude Agent SDK: `query()` options, `canUseTool` signature and return shape, permission modes, `allowedTools`, `settingSources`, session resume, streaming input mode, interrupts, the message types it emits, and the current names and input shapes of built-in tools (`Edit`, `Write`, `Bash`, etc.). Docs: https://code.claude.com/docs/en/agent-sdk/overview and https://code.claude.com/docs/en/agent-sdk/permissions
- Effect 4: RPC (WebSocket protocol, streaming RPCs), `ChildProcess`, SQL + SQLite driver + `Migrator`, `HttpClient`, `AtomRpc`. Docs: https://effect.website/docs
- Latest stable versions of every dependency on npm.

If anything in this spec conflicts with the current APIs, follow the real API and note the deviation.

## 4. Architecture

```
┌────────────────────────── Browser (localhost) ──────────────────────────┐
│ Vite + React 19 + TanStack Router + shadcn/ui                            │
│  Chat (Streamdown) │ Review panel (hunks, Shiki) │ Timeline / tool cards │
│                 Effect Atom (AtomRpc client)                             │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ Effect RPC over WebSocket (token auth)
┌───────────────────────────────┴──────────────────────────────────────────┐
│ Daemon (Effect 4, Node)                                                  │
│  RpcServer ─ ProjectService ─ GitService (ChildProcess → git CLI)        │
│            ─ SessionService ─ AgentRunner (Claude Agent SDK)             │
│            ─ ApprovalService (Deferred + PubSub) ─ PolicyService         │
│            ─ GitHubService (HttpClient + Schema)                         │
│            ─ Database (SQLite, Effect SQL, Migrator)                     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Monorepo layout

```
humanity/
├─ apps/
│  ├─ server/        Effect daemon: RPC handlers, services, Agent SDK bridge
│  └─ web/           Vite + React app
├─ packages/
│  ├─ contracts/     RpcGroups, Schemas, event/union types shared by server and web
│  └─ diff/          Pure hunk logic on top of jsdiff (no I/O, fully unit-tested)
├─ turbo.json
├─ package.json      npm workspaces root
├─ eslint.config.js
└─ .prettierrc
```

Turborepo tasks: `dev`, `build`, `lint`, `typecheck`, `test`. Root scripts must run them across the workspace.

### Runtime layout

- Data directory: `~/.humanity/` (override with `HUMANITY_HOME`).
  - `humanity.db` — SQLite database.
  - `worktrees/<projectId>/<sessionId>/` — the worktree of a session that has one.
  - `repos/<owner>/<repo>/` — clones made from GitHub.
  - `auth-token` — daemon auth token.
- The daemon listens on `127.0.0.1` only (default port 7420, configurable).
- On first start, the daemon generates a random auth token, stores it in `auth-token` and prints a URL like `http://127.0.0.1:7420/?token=...`. The web app stores the token and sends it when opening the WebSocket; connections without a valid token are rejected. Keep this even though the MVP is local-only, so remote access later is purely a networking change.
- In development, the Vite dev server proxies the RPC WebSocket to the daemon. In production, the daemon serves the built web assets.
- `ANTHROPIC_API_KEY` is read from the environment.

## 5. The human-in-the-loop core

This is the most important part of the MVP. Get it right before polishing anything else.

### 5.1 Tool policies

Each project has a policy mapping tools to one of four modes:

| Mode | Meaning | MVP defaults |
|---|---|---|
| `auto` | Runs without asking | Read-only tools: `Read`, `Glob`, `Grep`, and other read-only built-ins |
| `review` | Hunk-by-hunk review of the proposed file change | All file-mutating tools (`Edit`, `Write`, and any other mutating built-ins the SDK currently exposes) |
| `confirm` | Show the call (command / input), human allows or denies | `Bash`, web tools, all MCP tools (`mcp__*`), anything unknown |
| `deny` | Always denied | none by default |

- Unknown tools default to `confirm`. Never default to `auto`.
- Never use `bypassPermissions`. Use the SDK's default permission mode so every non-`auto` call reaches `canUseTool`. Put `auto` tools in `allowedTools`.
- The policy is editable in the UI per project (simple table in settings is enough).

### 5.2 Bridging `canUseTool` to the UI

`canUseTool` is a Promise-based callback. Bridge it into Effect:

1. The `AgentRunner` runs the SDK `query()` with `cwd` set to the folder the session works in (its worktree, or the project's checkout) and `canUseTool` implemented via a `ManagedRuntime` (or equivalent) that runs an Effect program.
2. That program asks `PolicyService` for the tool's mode.
3. For `review` / `confirm`, it creates a `PendingApproval` with a `Deferred`, stores it in `ApprovalService` (a `Ref<Map>` or `SynchronizedRef`), persists it, publishes an event on the session's `PubSub`, then awaits the `Deferred`.
4. The UI receives the event through a streaming RPC, the human decides, and the `Approvals.decide` RPC completes the `Deferred`.
5. Honor the SDK's abort signal: if the session is interrupted, fail the `Deferred` and clean up.
6. Pending approvals survive a browser refresh (they live in the daemon and the DB). If the daemon restarts, mark them as `expired`.

### 5.3 Review flow for file changes

When a `review` tool is called:

1. Read the current file content from the session's folder (`""` if the file doesn't exist).
2. Compute the full proposed content by simulating the tool on that content (for `Edit`: replace `old_string` with `new_string`, honoring `replace_all`; for `Write`: the given content). If simulation fails (e.g. `old_string` not found), deny immediately with an explanatory message.
3. Use `packages/diff` to build a `ProposedChange` with hunks (`structuredPatch`).
4. Wait for the human. Outcomes:
   - **All hunks approved** → return `allow` with the original input. The SDK applies the change.
   - **All hunks rejected** → return `deny` with a message combining the human's comments per hunk.
   - **Partial approval** → the daemon applies only the approved hunks itself (`applyPatch` on a filtered patch), writes the file, then returns `deny` with a clear structured message, e.g.:
     ```
     PARTIALLY APPLIED by the human reviewer to src/app.ts.
     Applied: hunks 1, 3. Rejected: hunk 2 — "Keep the old validation, it's used by the CLI".
     The file on disk now differs from what you proposed. Re-read it before making further edits.
     ```
   Write this message format once in a single function and unit-test it. The agent must never believe a change was fully applied when it wasn't.
5. Persist the decision for every hunk (`hunk_decisions` table).

### 5.4 Confirm flow

For `confirm` tools, show the tool name, a human-readable rendering of the input (for `Bash`: the command and its description) and Allow / Deny buttons, with an optional comment. A deny comment is returned as the `deny` message. Optionally offer "Always allow this tool for this project", which updates the policy.

## 6. Domain model

Define these in `packages/contracts` with Effect `Schema`.

```ts
type HunkStatus = "pending" | "approved" | "rejected" // "edited" reserved for post-MVP

interface Hunk {
  id: string
  index: number            // 1-based, shown to the user and used in agent messages
  oldStart: number; oldLines: number
  newStart: number; newLines: number
  lines: string[]          // unified diff lines with +/-/space prefixes
  status: HunkStatus
  comment?: string
  // post-MVP: editedLines?: string[]
}

interface ProposedChange {
  id: string
  sessionId: string
  toolUseId: string
  toolName: string
  filePath: string         // relative to the session's folder
  kind: "create" | "modify"
  originalContent: string
  proposedContent: string
  hunks: Hunk[]
  status: "pending" | "applied" | "partially_applied" | "rejected" | "expired"
  createdAt: string; decidedAt?: string
}

interface PendingConfirmation {
  id: string
  sessionId: string
  toolUseId: string
  toolName: string
  input: unknown
  status: "pending" | "allowed" | "denied" | "expired"
  comment?: string
}
```

### Session events (streaming RPC payload)

A tagged union streamed to the UI per session, e.g.:

- `SessionStatusChanged` (idle / running / waiting_for_human / interrupted / error)
- `AgentMessage` (normalized SDK message: assistant text, thinking if exposed, tool_use, tool_result, result/usage)
- `ToolCallStarted` / `ToolCallFinished`
- `ApprovalRequested` (ProposedChange or PendingConfirmation)
- `ApprovalResolved`
- `SkillLoaded` (when a Skill tool call is detected)

Keep the raw SDK message alongside the normalized form in the DB so renderers can be improved later without data loss.

## 7. Persistence (SQLite)

Use Effect SQL with `Migrator`; one migration file per change. Initial tables:

- `projects` — id, name, local_path, github_full_name (nullable), default_branch, policy_json, created_at
- `sessions` — id, project_id, sdk_session_id, title, branch, worktree_path (the folder the agent works in), in_worktree, status, created_at, updated_at
- `messages` — id, session_id, role, normalized_json, raw_json, created_at
- `tool_calls` — id, session_id, tool_use_id, tool_name, input_json, output_json, status, started_at, finished_at
- `proposed_changes` — fields from `ProposedChange` (hunks stored as JSON)
- `hunk_decisions` — id, proposed_change_id, hunk_index, decision, comment, decided_at
- `confirmations` — fields from `PendingConfirmation`

Never store the GitHub token or the Anthropic API key in the database.

## 8. Services (server)

Each is an Effect service with a live layer and a test layer.

- **GitService** — wraps the git CLI with `ChildProcess`. Always use the array form (`command`, `args[]`), never interpolate user input into a shell string. Use machine-readable output: `git status --porcelain=v2`, `git worktree list --porcelain`, `git branch --format=...`, `git diff --no-color`. Operations: listBranches, currentBranch, createBranch, checkout, status, diff (parsed with jsdiff's `parsePatch` so the same hunk UI can show the worktree's diff), worktreeAdd, worktreeRemove, clone (stream progress lines to the UI), commit. Errors are tagged (`GitNotARepository`, `GitBranchExists`, `GitCommandFailed` with stderr, ...).
- **GitHubService** — Effect `HttpClient` against the GitHub REST API. Token from `gh auth token` if the gh CLI is available, otherwise `GITHUB_TOKEN` env (recommend a fine-grained token in the README). Endpoints: authenticated user's repos, a repo, its branches. Schemas only describe fields actually used. Handle pagination via the `Link` header as a `Stream`; map rate-limit responses (`x-ratelimit-*` headers) to a tagged error.
- **ProjectService** — add local project (validate it's a git repo), clone from GitHub into `~/.humanity/repos`, list, remove (never deletes the user's repo on disk, only Humanity's records and worktrees).
- **SessionService** — create a session in the project's checkout, switching it to the chosen branch first; set up a worktree on request (branch `humanity/<short-id>-<slug>` from the checkout's HEAD; only between turns; the conversation resumes there and the agent is told it moved); list; resume (via the SDK's session resume using `sdk_session_id`); send message; interrupt; end session (optionally remove worktree).
- **AgentRunner** — owns SDK `query()` calls. Use streaming input mode so the user can send follow-up messages and interrupt. Set `settingSources` to include the project so `CLAUDE.md`, Skills and project settings load. Convert the SDK's async iterable into an Effect `Stream`, normalize messages, persist them and publish events.
- **ApprovalService** — pending approvals registry, `Deferred` handling, persistence, expiration on restart.
- **PolicyService** — reads/writes per-project tool policies, resolves a tool name to a mode (with `mcp__<server>__<tool>` pattern support).

## 9. RPC contracts

Define `RpcGroup`s in `packages/contracts`. Suggested surface:

- `Projects`: `list`, `addLocal`, `cloneFromGitHub` (streaming progress), `remove`, `getPolicy`, `setPolicy`
- `Git`: `branches`, `createBranch`, `status`, `diff`
- `GitHub`: `listRepos`, `listBranches`, `whoami`
- `Sessions`: `list`, `get`, `create`, `setupWorktree`, `sendMessage`, `interrupt`, `end`, `subscribe` (streaming `SessionEvent`s; on subscribe, first replay current state: messages, pending approvals)
- `Approvals`: `listPending`, `decideChange` (per-hunk decisions + comments), `decideConfirmation`

All errors are tagged and declared in the schema so the UI can show precise messages.

## 10. Frontend

### Routes (TanStack Router, file-based)

- `/` — project list, add local project, clone from GitHub
- `/projects/$projectId` — project overview: branches, sessions, policy settings
- `/projects/$projectId/sessions/$sessionId` — main workspace
  - typed search params: `?file=<path>&hunk=<n>` deep-link to a hunk under review

The router owns navigation and params only. Data comes from atoms (`AtomRpc` queries, mutations and streams). Don't duplicate data fetching in route loaders.

### Session workspace layout

- **Header**: project name, branch + worktree indicator, session status badge (`running`, `waiting for you`, ...), a "Source Control" button that opens the right panel, interrupt button. While the session works in the checkout, the panel's title bar offers "Set up worktree", left of its refresh button.
- **Center — chat**: messages rendered with Streamdown; tool calls inline as compact cards (one-line summary, expandable).
- **Right panel — Review** (opens automatically when an approval is pending): list of pending changes; per file, hunks rendered with Shiki highlighting, each with Approve / Reject buttons and a comment field; bulk "Approve all" / "Reject all"; a Submit button that sends all hunk decisions at once. Keyboard shortcuts: `j`/`k` move between hunks, `a` approve, `r` reject, `c` comment, `Enter` submit.
- **Right panel — Timeline** (tab): chronological list of tool calls, Skill loads and decisions, with durations.
- Confirmations (Bash, MCP, etc.) appear as a card pinned above the chat input until decided.

The UI must make it obvious when the agent is blocked waiting for the human.

### Tool call renderers

A registry in `apps/web`:

```ts
interface ToolRenderer {
  match: (toolName: string, input: unknown) => boolean
  Summary: React.FC<ToolCallProps>   // one line, used in chat and timeline
  Detail: React.FC<ToolCallProps>    // expanded view
}
```

The registry tries renderers in order and falls back to a generic renderer: collapsible JSON of input and output, highlighted with Shiki. MVP renderers: `Read` (path + line range, content preview), `Edit`/`Write` (reuse the hunk view, read-only after decision), `Bash` (command, description, output with ANSI colors handled), `Glob`/`Grep` (pattern + result list), Skill calls (skill name, why it loaded), MCP tools (generic renderer that parses `mcp__<server>__<tool>` and shows server and tool names as badges).

### Theming

Tailwind + shadcn/ui with light and dark mode. Use Shiki's dual-theme output wired to the same CSS variables so code in chat and diffs follows the theme.

## 11. Testing

- Vitest across the workspace; `@effect/vitest` (`it.effect`, test layers) for Effect code.
- `packages/diff`: exhaustive unit tests — hunk splitting, applying any subset of hunks, file creation, trailing newline edge cases, CRLF files, the partial-application agent message.
- Approval flow: test with a fake `AgentRunner` that emits scripted tool calls; assert that `review` calls block until decided, partial approval writes the right file content and returns the right deny message, interrupts fail pending `Deferred`s.
- `GitService`: integration tests against temporary repos created in a temp dir.
- `GitHubService`: test with a mocked `HttpClient` layer (pagination, rate limit).
- No tests hit the real Anthropic or GitHub APIs.

## 12. Milestones

Complete each milestone fully (lint, typecheck and tests passing) and commit before starting the next.

**M0 — Scaffold.** npm workspaces + Turborepo, TypeScript strict, ESLint + Prettier, Vitest, empty `apps/server`, `apps/web`, `packages/contracts`, `packages/diff`. Current APIs checked (section 3).
*Done when:* `npm run lint`, `npm run typecheck`, `npm run test` and `npm run dev` work from the root.

**M1 — Daemon foundation.** Effect HTTP server on `127.0.0.1`, RPC over WebSocket with token auth, SQLite + migrations, `Projects.list/addLocal/remove`. Web app connects via `AtomRpc` and shows the project list.
*Done when:* adding a local repo in the UI persists across daemon restarts; connections without the token are rejected.

**M2 — Git.** `GitService`, branches list/create, status, worktree add/remove, worktree diff rendered with the shared hunk component (read-only).
*Done when:* integration tests pass on temp repos and the project page shows branches and status.

**M3 — Agent chat.** `SessionService` + `AgentRunner`: create session (branch + worktree), send messages, stream events, Streamdown rendering, interrupt, resume. All non-read tools are temporarily denied with a message.
*Done when:* a user can chat with the agent about the repo, refresh the page and see the full history, and resume the session after a daemon restart.

**M4 — Human in the loop.** Policies, `canUseTool` bridge, `ApprovalService`, review panel with per-hunk decisions, partial application, confirmations for `Bash`/MCP, keyboard shortcuts, deep links to hunks.
*Done when:* the agent's edits never reach disk without approval; partial approval produces the expected file and agent message; all approval-flow tests pass.

**M5 — Visibility.** Tool renderer registry with the MVP renderers, timeline tab, Skill detection, MCP rendering.
*Done when:* every tool call in a session is readable without opening raw JSON, except tools with no custom renderer.

**M6 — GitHub.** `GitHubService`, list repos, clone with streamed progress, list remote branches, switch project and branch from the UI.
*Done when:* a user can go from "nothing" to an agent session on a freshly cloned GitHub repo entirely from the UI.

**M7 — Polish (if time allows).** Decision history view per project, "always allow" from confirmation cards, commit approved changes from the UI, README with setup instructions.

## 13. Engineering rules

- Never call the git CLI with shell-interpolated strings; always argument arrays.
- Never write outside `~/.humanity/` or the folder the session works in: its worktree, or the project's checkout until it has one.
- No `any` in contracts. Validate every RPC payload and DB row with `Schema`.
- Errors are tagged, typed and shown in the UI with actionable messages; no silent failures.
- Keep `packages/diff` free of I/O and framework dependencies.
- Keep components small; the review panel and renderers are the heart of the product, so prioritize their clarity and keyboard ergonomics.
- When the spec and reality disagree, or a decision isn't covered here, **ask the human** rather than guessing silently.
