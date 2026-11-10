# API verification notes

Verified on 2026-11-09 against the packages actually installed in `node_modules` (type declarations, `exports` fields and the `ai-docs` shipped inside `effect`), not against online examples. Where the spec and the real API disagree, the real API wins and the deviation is listed under **Deviations**.

## Versions pinned

| Package                                                                                              | Version                        | Note                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| `effect`, `@effect/platform-node`, `@effect/sql-sqlite-node`, `@effect/atom-react`, `@effect/vitest` | `4.1.2`                        | all exact, same number                    |
| `@anthropic-ai/claude-agent-sdk`                                                                     | `0.3.321`                      |                                           |
| `typescript`                                                                                         | `6.0.3`                        | **not** 7.0.2, see Deviations             |
| `turbo`                                                                                              | `2.11.10`                      |                                           |
| `vite` / `@vitejs/plugin-react`                                                                      | `8.3.7` / `6.3.0`              |                                           |
| `react`, `react-dom`                                                                                 | `19.3.1`                       |                                           |
| `@tanstack/react-router` / `@tanstack/router-plugin`                                                 | `1.170.46` / `1.169.0`         |                                           |
| `tailwindcss`, `@tailwindcss/vite`                                                                   | `4.3.5`                        | CSS-first config, no `tailwind.config.js` |
| `diff` (jsdiff)                                                                                      | `9.0.0`                        | ships its own types                       |
| `shiki`                                                                                              | `4.6.0`                        |                                           |
| `streamdown`                                                                                         | `2.7.1`                        |                                           |
| `vitest`                                                                                             | `5.1.0`                        | required by `@effect/vitest` (`>=5 <6`)   |
| `eslint` / `typescript-eslint` / `eslint-plugin-react-hooks`                                         | `10.14.0` / `8.72.2` / `7.1.1` |                                           |
| `prettier`                                                                                           | `3.9.10`                       |                                           |
| Node.js                                                                                              | `v24.12.0` locally             | spec requires `>= 22`                     |

## Effect 4.1.2

Import paths are the stable ones from the spec (`effect/rpc`, `effect/sql`, `effect/http`, `effect/process`, `effect/socket`, `effect/reactivity`, `effect/testing`). Nothing is imported from `effect/unstable/*`; that path does not exist in 4.1.2. Most of these modules are still tagged `@stability unstable`.

- **Services** — `Context.Service<Self, Shape>()("id")`, with a static `layer`. Errors: `Schema.TaggedError<Self>()("Tag", fields)`.
- **RPC** (`effect/rpc`) — `Rpc.make(tag, { payload, success, error, stream })`, `RpcGroup.make(...rpcs)`, `group.toLayer(handlers)`. A streaming RPC is `stream: true`; its handler returns a `Stream`.
  - Server over WebSocket: `RpcServer.toHttpEffectWebsocket(group)` returns an HTTP effect that upgrades the request. We mount it ourselves on `HttpRouter` so the token can be checked **before** the upgrade.
  - Client: `RpcClient.layerProtocolSocket()` on top of `Socket.layerWebSocket(url)` + `Socket.layerWebSocketConstructorGlobal`.
  - Serialization: `RpcSerialization.layerJson` on both sides (one JSON message per WebSocket frame).
  - `RpcTest.makeClient(group)` gives an in-memory client for tests.
- **HTTP server** — `HttpRouter.add/use/serve` from `effect/http`, `NodeHttpServer.layer(createServer, { port, host })` from `@effect/platform-node`. Static files: `HttpStaticServer.layer({ root, spa: true })`.
- **Child processes** (`effect/process`) — `ChildProcess.make(command, args[], options)` run through `ChildProcessSpawner` (`spawner.string`, `spawner.lines`, `spawner.spawn` for streaming). Provided by `NodeServices.layer`. Argument arrays only; no shell.
- **SQL** — `SqlClient` / `SqlSchema` from `effect/sql`; driver `SqliteClient.layer({ filename })` and `SqliteMigrator.layer({ loader })` from `@effect/sql-sqlite-node`. Loader used: `SqliteMigrator.fromRecord`, with one module per migration.
- **HTTP client** — `HttpClient`, `HttpClientRequest`, `HttpClientResponse.schemaBodyJson` from `effect/http`; live implementation `FetchHttpClient.layer`.
- **Atoms** — `AtomRpc.Service<Self>()(id, { group, protocol })` from `effect/reactivity` exposes `.query(tag, payload)`, `.mutation(tag)` and `.runtime`. React hooks (`useAtomValue`, `useAtomSet`, ...) and `RegistryProvider` come from `@effect/atom-react`.
- **Tests** — `it.effect`, `it.live`, `layer(...)` from `@effect/vitest`; `TestClock` from `effect/testing`.

## Claude Agent SDK 0.3.321

- `query({ prompt, options })` returns a `Query`, an `AsyncGenerator<SDKMessage>` with control methods. `prompt` may be an `AsyncIterable<SDKUserMessage>` (**streaming input mode**), which is what enables follow-up messages and `query.interrupt()`.
- `SDKUserMessage` minimum shape: `{ type: "user", message: { role: "user", content }, parent_tool_use_id: null }`.
- `canUseTool(toolName, input, { signal, toolUseID, suggestions, ... })` returns `Promise<PermissionResult>`:
  - `{ behavior: "allow", updatedInput? }`
  - `{ behavior: "deny", message, interrupt? }`
- `permissionMode`: `"default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "auto"`. Humanity always uses `"default"` and never sets `allowDangerouslySkipPermissions`.
- `allowedTools: string[]` — tools that run without prompting. Only `auto`-mode tools from the project policy go here.
- `settingSources: ("user" | "project" | "local")[]` — must include `"project"` to load `CLAUDE.md`. Humanity passes `["project"]` (see `decisions.md`).
- `resume: sdkSessionId` resumes a session; the id arrives on the `system`/`init` message as `session_id` (and on every later message).
- `includePartialMessages: true` adds `stream_event` messages carrying raw Messages API stream events, used for token streaming.
- `hooks.PreToolUse` callbacks can return `hookSpecificOutput.permissionDecision: "allow" | "deny" | "ask" | "defer"`.
- Message types handled: `system` (`init`), `assistant` (content blocks `text`, `thinking`, `tool_use`), `user` (content blocks `tool_result`, plus `tool_use_result`), `stream_event`, `result` (`success` or `error_*`, with `total_cost_usd`, `usage`, `num_turns`). Every other type is persisted raw and ignored by the normalizer.
- Built-in tool inputs (from `sdk-tools.d.ts`):
  - `Edit`: `{ file_path, old_string, new_string, replace_all? }` (absolute path)
  - `Write`: `{ file_path, content }` (absolute path)
  - `NotebookEdit`: `{ notebook_path, cell_id?, new_source, cell_type?, edit_mode? }`
  - `Bash`: `{ command, description?, timeout?, run_in_background? }`
  - `Read`: `{ file_path, offset?, limit?, pages? }`
  - `Glob`: `{ pattern, path? }`
  - `Grep`: `{ pattern, path?, glob?, output_mode?, ... }`
  - `Skill`: `{ skill, args? }`
  - There is no `MultiEdit` tool in this version.

## Deviations from the spec

1. **TypeScript 6.0.3 instead of the latest 7.0.2.** `typescript-eslint@8.72.2` (required by the spec's lint stack) declares `typescript >=4.8.4 <6.1.0`. TypeScript 7 would break linting, so the newest version inside that range is pinned.
2. **SQLite driver uses `node:sqlite`.** `@effect/sql-sqlite-node@4.1.2` has no native dependency; it wraps Node's built-in `node:sqlite` (`DatabaseSync`). No `better-sqlite3` is installed. Node's own minimum for this is 22.5.
3. **Token check happens at the WebSocket upgrade, not inside the RPC protocol.** Browsers cannot set headers on a WebSocket, so the token travels as `?token=` on the `/rpc` URL and is compared before `toHttpEffectWebsocket` upgrades the connection. Invalid or missing tokens get `401` and no socket.
4. **`PreToolUse` hook in addition to `canUseTool`.** The spec routes approvals through `canUseTool` only. But `canUseTool` is skipped for anything matched by an `allow` rule in a loaded settings file, so a repository's `.claude/settings.json` could let an edit through unreviewed. A `PreToolUse` hook therefore returns `ask` for every tool whose policy mode is not `auto` (and `deny` for `deny`), forcing the call into `canUseTool`. The approval logic itself still lives only in `canUseTool`.
5. **No real-API verification.** Per spec section 11 nothing in this repo calls the real Anthropic API. The SDK behaviour above is taken from its type declarations and doc comments; the approval flow is tested against a scripted fake `AgentRunner`.

## Observed with the real CLI (M3 smoke run, invalid API key, no billable call)

- The CLI bundled with SDK 0.3.321 started in the session worktree and accepted every option Humanity passes (`hooks` with `onFailure: "block"`, the `claude_code` preset with `append`, `settingSources: ["project"]`, `includePartialMessages`, `CLAUDE_CONFIG_DIR`).
- It printed `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`: bare `allowedTools` entries auto-approve the whole tool and `canUseTool` is never consulted for them. That is the intended behavior for `auto` tools, and it confirms that only `auto` tools may go in `allowedTools`. The SDK names a `PreToolUse` hook as the way to gate tools that settings files could pre-approve, which is what the policy guard does.
- The init message listed more tools than `sdk-tools.d.ts` documents, including `PowerShell`, `Task`, `EnterWorktree`, `Cron*` and `Monitor`. Anything without an explicit rule falls back to `confirm`.
- The default model reported was `claude-opus-5-5`.
- An authentication failure arrives as an assistant text message followed by a `result` with `subtype: "success"` and `is_error: true`. Humanity treats any `is_error` result as an error turn.
- Transcripts were written to `$CLAUDE_CONFIG_DIR/projects/<encoded cwd>/<sdk session id>.jsonl`, inside the data directory.
