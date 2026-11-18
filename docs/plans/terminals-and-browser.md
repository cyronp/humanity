# Plan: terminals and the localhost browser

Last updated 2026-11-18. The spec (`docs/spec.md`, "Amendment: terminals in a dock") is the source of truth; this plan is how we get there, phase by phase, and what is already done.

## Why

The shelf amendment of 2026-11-17 planned one shared terminal per thread and a localhost preview. The human wants a terminal that is really usable, by them and by the agent, modelled on Orca ([stablyai/orca](https://github.com/stablyai/orca)). Orca's terminal is built like this:

- a PTY host on node-pty;
- a headless xterm per terminal, for snapshots and for the agent's reads;
- shell integration;
- agents that drive terminals by reading, sending and waiting.

The browser comes after the terminal and builds on it: links in terminals and in `Bash` output open in it.

## Decisions taken with the human

### Terminals

| Topic | Decision |
|---|---|
| How many | Any number per thread, as **tabs**, with no splits |
| Where | A **dock under the chat**, toggled with Ctrl+`. A shelf tool can stay open beside it. |
| Buttons | Two buttons are always at the top right: **panel-bottom** opens and closes the dock, **panel-right** shows and hides the tool rail with its panel |
| Dock controls | The **minimize bar** hides the dock and leaves its terminals running. The **X** ("Close terminal") closes every terminal of its owner and the dock. |
| Owners | A thread. On the new-thread page, the selected project, else the human's home. Agents only ever see their own thread's terminals. |
| Lifetime | A terminal survives page reloads with its process. After a daemon or app restart it is **cold-restored**: its saved screen comes back with a fresh shell in its last folder. |
| Packages | `@xterm/headless`, `addon-serialize`, `addon-search`, `addon-web-links`, `addon-unicode11` and `addon-webgl`, on top of `@xterm/xterm`, `addon-fit` and `node-pty` |
| Shell | The OS default (Windows: `pwsh`, else `powershell.exe`; elsewhere `$SHELL -l`), plus a Settings → Terminal choice of shell, font size and scrollback |
| Shell integration | OSC 133 (command start and end, exit code) and OSC 7 (folder) for PowerShell, bash, Git Bash, zsh and fish. `cmd` gets none. |
| Worktree move | Idle terminals restart in the worktree and keep their scrollback. Busy ones keep running and are marked "checkout". |
| Agent tools | `terminal_list`, `terminal_read`, `terminal_send`, `terminal_wait`, `terminal_open`, `terminal_close`. **Humanity's own MCP handler** decides input as `Bash` with `{command}` on every provider, because Codex's MCP prompt shows neither the tool name nor its arguments. |

### Browser

| Topic | Decision |
|---|---|
| Kind | An **iframe preview** of `localhost`, `127.0.0.1` and `[::1]`, the same in a browser tab and in the desktop app |
| Where | A **shelf tool** (a Browser icon on the rail) |
| Addresses offered | **URLs printed** in terminals and in `Bash` output. No port scan. |
| Agent | **No access** for now |

## Status

| Phase | What | State |
|---|---|---|
| 0 | Spec amendment | ✅ `b3956de` |
| 1 | Daemon: PTYs, screen model, RPC, persistence | ✅ `264c4b4`, `7be384e` |
| 2 | Web: the dock, the two top-right buttons, Settings → Terminal | ✅ `58d42ce`, `2efa5cb`, `2ab1b77`, `14b96bc` |
| — | Terminals outside a thread (project, home), shell icons | ✅ `ef8294c`, `426175e` |
| 3 | Shell integration | ✅ checked on real PowerShell 7, Windows PowerShell and Git Bash |
| 4 | The agent's terminal tools | ✅ reads and waits checked on real PowerShell 7, Windows PowerShell and Git Bash |
| 5 | Desktop packaging | ✅ node-pty ships as 2.6 MB of its Windows files; checked on the packaged daemon, on Electron's Node |
| 6 | Browser (localhost preview) | ✅ lint, typecheck, tests and build pass; not yet looked at in a real browser |

### What is built (phases 0–2)

- **Daemon** (`apps/server/src/terminal/`):
  - **`PtyHost.ts`:** node-pty behind a service. Uses ConPTY's DLL on Windows. A fake host is available for tests.
  - **`screen.ts`:** a headless xterm per terminal, with Unicode11 and Serialize.
  - **`shells.ts`:** detects shells. It finds Git Bash beside git, and Microsoft Store app aliases such as PowerShell 7.
  - **`environment.ts`:** builds a terminal's environment without `HUMANITY_*`, `npm_*`, the agents' session variables or (on Windows) `PSModulePath`.
  - **`TerminalService.ts`:**
    - **Attach:** a view gets a snapshot, then output batched every 8 ms or 16 K characters, and acknowledges by `seq`. Past 512 K unacknowledged characters it gets a fresh snapshot instead of the backlog.
    - **Persistence:** screens are saved every 5 s and on stop, under `~/.humanity/terminals/`, and cold-restored lazily.
    - **Queries:** the daemon answers every query a program sends; views stay silent on them.
    - **ConPTY restarts:** a ConPTY shell started on a screen that already has content gets that screen scrolled into the scrollback first.
- **Contracts:**
  - `packages/contracts/src/domain/Terminal.ts`: `TerminalOwner`, `TerminalInfo`, `TerminalAttachEvent`, `TerminalPreferences`.
  - `packages/contracts/src/rpc/Terminals.ts`: `list`, `watch`, `open`, `close`, `rename`, `restart`, `attach`, `write`, `resize`, `ack`, `shells`.
  - `Preferences.getTerminal` and `Preferences.setTerminal`.
- **Database:** migration `0021_terminals`.
- **Web** (`apps/web/src/features/terminal/`):
  - **`TerminalView.tsx`:** xterm with WebGL, falling back to the DOM. Keystrokes go out in order, one request at a time. Output is acknowledged once drawn.
  - **`TerminalDock.tsx`:** tabs, find bar, context menu, exit bar.
  - **`keys.ts`:** the key policy.
  - **`theme.ts`:** colors from the page's CSS variables.
  - **`dock.ts`:** what the browser remembers.
  - **Elsewhere:** the vertical `ResizeHandle` and `features/settings/TerminalSettings.tsx`.
- **Checked live** against a real PowerShell through the daemon's RPC: running commands, reattaching, cold restore and restart. Not yet looked at in a real browser by the human.

---

## Phase 3: shell integration

**Goal:** the daemon knows, for every terminal:
- whether a command is running;
- the exit code of the last one;
- the folder the shell is in.

It keeps command spans (where each command's output starts and ends in the buffer) for `terminal_wait`.

### Scripts

`apps/server/src/terminal/integration/` holds the scripts as TS string constants, so esbuild bundles them. At startup they are written to `~/.humanity/shell-integration/`, and only rewritten when their content changes.

| Shell | How it is started | What the script does |
|---|---|---|
| pwsh / powershell | `-NoLogo -NoExit -EncodedCommand <dot-source the script>`, so execution policies don't block it. The profile still loads. | Wraps `prompt` to emit `133;D;<exit>`, `7;file://<host>/<cwd>`, `133;A`, the prompt, then `133;B`. Hooks PSReadLine's `AcceptLine` to emit `133;C`. Forces UTF-8 console encoding. |
| bash, Git Bash | `--rcfile <humanity.bash>`, plus `-i`. On Unix it runs as a login shell through the wrapper. | Sources the human's files (`/etc/profile`, then `~/.bash_profile` or `~/.bash_login` or `~/.profile` for a login shell, else `~/.bashrc`). Then installs a `PROMPT_COMMAND` that emits D, 7 and A, and a `DEBUG` trap that emits C once per command. Coexists with bash-preexec. |
| zsh | `ZDOTDIR` pointing at a wrapper folder whose `.zshenv`/`.zprofile`/`.zshrc`/`.zlogin` source the human's own (`HUMANITY_USER_ZDOTDIR`, else `$HOME`), then add `precmd`/`preexec` hooks | Same markers |
| fish | `--init-command 'source <humanity.fish>'` | `fish_prompt`, `fish_preexec` and `fish_postexec` events |
| cmd, WSL | as today | none (`integration: false`) |

- The variables the wrappers need (`HUMANITY_USER_ZDOTDIR` and similar) are unset by the script itself once read, so the human's shell never shows them.

### Daemon

- In `TerminalService`, `screen.terminal.parser.registerOscHandler(133, …)` and `(7, …)` read the markers.
  - They set `integration: true` on the first marker, `busy` on C and D, `lastExitCode` on D, and `cwd` on 7.
  - Spans are kept as buffer markers (`registerMarker`), so they survive scrolling.
  - The spans list is capped, for example to the last 200 commands.
- `cwd` changes are written to the `terminals` row, debounced, so cold restore starts in the shell's last folder.
- `location` becomes `"checkout"` when a thread's terminal is outside the thread's folder.
- The handlers return `false`, so xterm still processes the sequences; OSC 7 is harmless.

### Worktree move

- `SessionService.setupWorktree` (`apps/server/src/services/SessionService.ts`, around line 984) calls a new `terminals.moveOwner(sessionId, newFolder)` once the worktree exists.
  - An idle terminal (integration on, not busy) is restarted in the new folder, with a marker line.
  - A busy terminal, or one without integration, is kept and marked `location: "checkout"`.
- The web dock already shows the busy dot and the "checkout" badge, which come alive in this phase.
- Also in this phase: the panel-bottom button's badge counts busy terminals.

### Tests

- Scripted OSC sequences through the fake pty: busy, exit code, cwd, spans, and `location`.
- The worktree move, with the fake host.
- Real shells (`it.live`, skipped when the shell is missing): bash on Linux CI, and pwsh/powershell when found on Windows. Each runs `false` then `cd sub`, and checks the exit code and the folder.

## Phase 4: the agent's terminal tools

**Goal:** the agent, on every provider, works in its thread's terminals as the human does. Reads are reads; anything that types is decided like `Bash`.

### MCP tools

Changes in `apps/server/src/mcp/HumanityMcp.ts`:

- Add six definitions to `tools/list`, and their branches to `callTool` (today only `open_thread`).
- Extend `HumanityTools` with `terminals: TerminalTools`.

| Tool | Input | Returns | Decided as |
|---|---|---|---|
| `terminal_list` | — | each terminal: id, title, shell, cwd, busy, last exit code, integration, who opened it | read |
| `terminal_read` | `terminal`, `view: "output" \| "screen"`, `since?`, `maxLines?` | text without ANSI, from the headless buffer, and a `cursor` (absolute line) to read from next | read |
| `terminal_send` | `terminal`, `text?`, `keys?` (`enter`, `ctrl+c`, `up`, `tab`…), `enter?` | a cursor to read the result from | `Bash` `{command: <text + keys>}` |
| `terminal_wait` | `terminal`, `for: "command" \| "pattern" \| "quiet"`, `pattern?`, `timeoutMs` (capped) | the output since the cursor; for `command`, the exit code. Without integration, `command` says so and suggests `quiet`. | read |
| `terminal_open` | `title?`, `command?` | the new terminal, in the thread's folder | read without a command; `Bash` with one |
| `terminal_close` | `terminal` | — | the agent's own: read; the human's: `Bash` `{command: "close terminal \"<title>\""}` |

- Only terminals owned by the calling thread are visible. Project and home terminals never are.

### Deciding inside Humanity's handler

- `SessionService` builds the terminal tools where it serves `openThread` (around line 666). They call the existing `decide(session, state)` (around line 440) with:
  - `toolName: "Bash"`
  - `input: { command, description }`
  - `toolUseId: "terminal:<uuid>"`
- **The card and "Always allow":** the confirmation card shows a Bash command, and "Always allow" of Bash in the thread covers these tools.
- **Deny:** the tool result is an error carrying the human's comment.
- **Nothing reaches the terminal before the answer.**
- The thread is re-read on each call, because the run's `Session` is a snapshot.

### Providers pass the six tools through to that handler

- **Contracts:** `packages/contracts/src/domain/Policy.ts` gets `HUMANITY_DECIDED_TOOLS`, which `toolMode` treats as `auto` at the provider level. A comment says the handler decides them.
- **Claude:** add them to `allowedTools` (`SessionService.ts`, around line 687). The PreToolUse `permissionGuard` lets them through. Check the SDK's MCP tool timeout and raise it if it is short.
- **Codex:** `humanityAutoTools` (`apps/server/src/agent/CodexRunner.ts`, around line 93) gives each tool `approval_mode: "approve"`. The `humanity` server also gets a long `tool_timeout_sec`, so a human deciding, or a `terminal_wait`, isn't cut off.
- **Kiro:** `toolMode` is `auto`, so `canUseTool` allows the call. Check Kiro's MCP call timeout.

### Other changes

- **Fake agent:** `apps/server/src/agent/AgentRunnerFake.ts` lets scripts call any `mcp__humanity__*` tool; `callHumanity` hardcodes `open_thread` today.
- **Web renderer** (`apps/web/src/features/tools/renderers/terminal.tsx`):
  - One-line summaries, such as "Sent `npm run dev` to Terminal 2" and "Waited for the command · exit 0".
  - The details show what was sent and the output read.
  - A **Show terminal** button opens the dock on that tab.

### Tests

- `HumanityMcp.test.ts`: the schemas, and an unknown terminal.
- `SessionService.test.ts`, with the fake agent and the fake pty:
  - In "Ask me", `terminal_send` creates a Bash confirmation and writes nothing until it is allowed; a deny returns the comment.
  - In "Auto mode", the input is written at once.
  - Closing the agent's own terminal never asks.
  - Another owner's terminal is never visible.
- `CodexRunner.test.ts`: the approve entries and `tool_timeout_sec`.
- `Policy.test.ts`: `HUMANITY_DECIDED_TOOLS`.

## Phase 5: desktop packaging

- **`apps/desktop/scripts/build.mjs`:**
  - Add `node-pty` to the daemon bundle's `external` (around line 44); `@xterm/headless` and its addons are pure JS and stay bundled.
  - Copy node-pty the way the Agent SDK is copied (around line 53), but only `package.json`, `lib/` and `prebuilds/<platform>-<arch>/`, without `*.pdb` (about 50 MB), `deps/`, `src/` or `third_party/`.
- **`.github/workflows/ci.yml`** "Check the packaged daemon" (around line 96): check that `node-pty/prebuilds/win32-x64/pty.node`, `conpty.node` and `conpty/conpty.dll` are there.
- **No Electron rebuild:** node-pty 1.1 is Node-API. The spec amendment records this deviation. npm's `allowScripts` already approves node-pty's install script, which Linux CI needs because there is no Linux prebuild.
- **Check in the packaged app:** open, reload and restart terminals.

## Phase 6: browser (localhost preview)

**Goal:** a Browser tool on the shelf previews the app the human or the agent is running, and terminals offer its address.

**What an iframe cannot do here:**
- It can't read the URL inside the frame, so the address bar shows what Humanity loaded.
- It can't go back or forward.
- It doesn't send `SameSite=Lax` cookies, so login flows may break.
- It can't show pages that send `X-Frame-Options`.

The panel's footer says: "Blank or refusing? Open in my browser."

### Contracts

New pure file `packages/contracts/src/domain/Preview.ts`:

- **`localUrls(text)`** finds `http(s)://(localhost|127.0.0.1|[::1]|0.0.0.0):port/path` after stripping ANSI.
  - It rewrites `0.0.0.0` to `localhost` and trims trailing punctuation.
  - It ignores LAN addresses, such as Vite's "Network:" line.
- **`previewTarget(input, refusedPorts)`** normalizes `localhost:3000` to `http://localhost:3000/`, and allows only those hosts over http and https.
  - It refuses Humanity's own ports with a message.
- **Tests:** ANSI, IPv6, `0.0.0.0`, punctuation, refused ports.

### Server

- `TerminalService` scans each pty chunk with `localUrls`, keeping a 4 KB carry per terminal so a URL split across chunks is still found.
- It keeps the last few unique URLs on `TerminalInfo.urls` (`{url, seenAt}`), streamed through `Terminals.watch`. No new RPC.

### Web

- **Shelf** (`apps/web/src/features/session/panel/shelf.ts`, `SessionPanel.tsx`): add a `"browser"` tool with a `Globe` icon. Header actions become per tool.
  - Git tools keep Sync, Set up worktree and Refresh.
  - The Browser gets an address field that suggests the offered URLs, Reload (a key bump) and "Open in my browser". Its body fills the panel, without the scroll area or padding.
- **`apps/web/src/features/browser/BrowserView.tsx`:**
  - `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads">`.
  - **Refused ports:** `location.port`, the daemon's port (`lib/connection.ts`), 7420 and 7421, matched whatever the host. Combining same-origin with scripts is only safe because Humanity's own ports are refused.
  - It stays mounted, hidden, while another shelf tool is open, so switching tools doesn't reload the previewed app.
  - The last URL per thread is kept in `localStorage` (`humanity.browser.<sessionId>`).
- **Offers:** `Workspace.tsx` merges `TerminalInfo.urls` with `localUrls` over the thread's `Bash` calls.
  - A new address puts a dot badge on the Browser icon.
  - The Browser's empty state lists the offered addresses.
- **Links:**
  - A localhost link clicked in a terminal (web-links handler) or in a `Bash` card (`renderers/shell.tsx`) opens in the Browser.
  - Ctrl/Cmd-click opens the system browser.
  - Other links are unchanged.
- **Resize:** `:root[data-resizing] iframe { pointer-events: none }` is already in `index.css`.
- **Desktop:** check that a link clicked inside the iframe stays in the frame (`will-navigate` fires for the main frame only) and that `target=_blank` goes to the system browser. Change the shell only if that fails, and ask first.

---

## Verification, end to end

Each phase must pass `npm run lint`, `npm run typecheck` and `npm run test`, then be committed (as the user, without trailers).

1. **Dock:** with `npm run dev`, Ctrl+` opens the dock with a terminal in the thread's folder.
   - Tabs, rename, find, links, copy and paste, and Ctrl+C all work.
   - Reloading the page keeps the screen and the running process.
   - Resizing doesn't garble the screen.
2. **Restart:** stop the daemon and start it again. Tabs come back with their screen, a marker line, and a fresh prompt in their last folder.
3. **Integration:** the busy dot follows a long command, and the tab's name follows `cd` (pwsh and Git Bash on Windows; bash and zsh on Linux and macOS).
4. **Worktree:** set up a worktree with one tab running a dev server and one idle. The idle tab moves to the worktree; the busy one is marked "checkout".
5. **Agent:** in "Ask me", on Claude Code, Codex and Kiro, ask: "start the dev server in a terminal and tell me its URL".
   - `terminal_open` and `terminal_send` ask as Bash, with the exact command.
   - The human sees the input typed in the dock.
   - In "Auto mode" nothing asks.
6. **Browser:** the dev server's URL lights the Browser icon and opens in the panel.
   - Humanity's own ports are refused.
   - Switching shelf tools keeps the previewed page.
7. **Desktop:** `npm run package:desktop`, install it, and repeat steps 1, 2 and 6.

## Risks and things to watch

- **ConPTY:** it sends queries at start-up and redraws as if the screen were empty; both are handled. Its win32-input-mode request (`?9001h`) is ignored by xterm, and plain VT input works. Watch IME and CJK input, which caused most of Orca's terminal bugs.
- **WebGL contexts:** the browser limits how many it keeps (about 16). Many open tabs may need a cap on hidden WebGL views, as Orca has.
- **Long waits in MCP calls:** human decisions and `terminal_wait` keep an HTTP request open, so provider timeouts must be raised where they exist.
- **Color queries (OSC 10 and 11):** the daemon answers with default colors, so a TUI that checks the background may guess dark. Sending the view's colors to the daemon would fix it later.
- **Flaky tests:** `Sync.test.ts` timed out once under a full parallel run, next to three dev servers, and passed alone.
