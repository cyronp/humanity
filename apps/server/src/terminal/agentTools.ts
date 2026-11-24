import {
  type SessionId,
  SHELL_TOOL,
  type TerminalInfo,
  terminalLabel,
  type TerminalToolName,
} from "@humanity/contracts"
import { Effect, Option, Schema } from "effect"
import { randomUUID } from "node:crypto"
import type { PermissionDecision, ToolPermissionRequest } from "../agent/AgentRunner.ts"
import type { AgentRead, AgentWait, TerminalService, WaitFor } from "./TerminalService.ts"

export interface ToolText {
  readonly text: string
  readonly isError: boolean
}

const DEFAULT_MAX_LINES = 200
const MAX_LINES = 2_000
const DEFAULT_WAIT_MS = 30_000
const MAX_WAIT_MS = 600_000
const DEFAULT_QUIET_MS = 2_000
const OPEN_READY_MS = 10_000

const terminalArgument = {
  type: "string",
  description: "The terminal: its number from terminal_list (`2`), or its id.",
}
const sinceArgument = {
  type: "string",
  description:
    "A cursor an earlier terminal tool returned: read what the terminal printed after it.",
}
const maxLinesArgument = {
  type: "integer",
  minimum: 1,
  maximum: MAX_LINES,
  description: `At most this many lines, the last ones (default ${DEFAULT_MAX_LINES}).`,
}

const ALWAYS_LOAD = { "anthropic/alwaysLoad": true } as const

export const HUMANITY_INSTRUCTIONS =
  "This thread has terminals shared with the human, shown in a dock under the chat. Run dev servers, watchers and anything else that keeps running there, with terminal_open (then terminal_wait for its ready line), not in your shell's background, so the human sees them and can use them too; use your shell for one-off commands. terminal_list shows the terminals already open, which the human may have started."

export const TERMINAL_TOOL_DEFINITIONS = [
  {
    name: "terminal_list",
    title: "List terminals",
    description:
      "Lists this thread's terminals: the ones the human sees in the dock under the chat, which you share with them. For each: its number, title, shell, folder, whether a command runs and the last command's exit code. Use a terminal for what keeps running (dev servers, watchers) or takes input; use your shell tool for one-off commands.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: ALWAYS_LOAD,
  },
  {
    name: "terminal_read",
    title: "Read a terminal",
    description:
      "Reads a terminal as the human sees it. `view: output` (the default): the lines printed since `since`, else the last `max_lines`. `view: screen`: what the screen shows now, for full-screen programs. Returns the text and a cursor to read on from.",
    inputSchema: {
      type: "object",
      properties: {
        terminal: terminalArgument,
        view: { type: "string", enum: ["output", "screen"] },
        since: sinceArgument,
        max_lines: maxLinesArgument,
      },
      required: ["terminal"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: ALWAYS_LOAD,
  },
  {
    name: "terminal_send",
    title: "Type into a terminal",
    description:
      "Types into a terminal: `text`, followed by Enter unless `enter` is false, and/or `keys` (enter, tab, escape, backspace, delete, up, down, left, right, home, end, pageup, pagedown, space, ctrl+<letter> such as ctrl+c). `text` takes no control or invisible characters other than a newline: press keys such as Tab with `keys`. The human sees it typed in the dock. It is a command: in a thread that asks first, the human allows or denies it before anything is typed, as for your shell tool. Returns a cursor: pass it as `since` to terminal_wait or terminal_read to get what followed.",
    inputSchema: {
      type: "object",
      properties: {
        terminal: terminalArgument,
        text: { type: "string", description: "Text to type, such as a command line." },
        enter: {
          type: "boolean",
          description: "Press Enter after `text` (default true).",
        },
        keys: {
          type: "array",
          items: { type: "string" },
          description: "Keys to press after `text`, in order.",
        },
      },
      required: ["terminal"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    _meta: ALWAYS_LOAD,
  },
  {
    name: "terminal_wait",
    title: "Wait on a terminal",
    description: `Waits on a terminal, then returns what it printed since \`since\` (else since the call). \`for: command\`: until the command that runs ends, with its exit code (needs a shell that reports its commands; terminal_list says so). \`for: pattern\`: until a regular expression matches the output, such as a dev server's ready line. \`for: quiet\`: until nothing is printed for \`quiet_ms\` (default ${DEFAULT_QUIET_MS}). Gives up after \`timeout_ms\` (default ${DEFAULT_WAIT_MS}, at most ${MAX_WAIT_MS}) and says so; what runs keeps running.`,
    inputSchema: {
      type: "object",
      properties: {
        terminal: terminalArgument,
        for: { type: "string", enum: ["command", "pattern", "quiet"] },
        pattern: { type: "string", description: "A regular expression, for `for: pattern`." },
        since: sinceArgument,
        timeout_ms: { type: "integer", minimum: 1, maximum: MAX_WAIT_MS },
        quiet_ms: { type: "integer", minimum: 100 },
        max_lines: maxLinesArgument,
      },
      required: ["terminal", "for"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: ALWAYS_LOAD,
  },
  {
    name: "terminal_open",
    title: "Open a terminal",
    description:
      "Opens a new terminal in this thread's folder, a tab in the dock the human sees, and optionally types `command` in it (in a thread that asks first, the human allows or denies it before, as for your shell tool). Use it for dev servers and other long-running processes, then terminal_wait for their ready line. Returns its number and a cursor.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "A short name for the tab, such as `dev server`." },
        command: {
          type: "string",
          description: "A command line to run in it, with no control or invisible characters.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: ALWAYS_LOAD,
  },
  {
    name: "terminal_close",
    title: "Close a terminal",
    description:
      "Closes a terminal, stopping what runs in it. Closing one the human opened is a command: in a thread that asks first, they allow or deny it before.",
    inputSchema: {
      type: "object",
      properties: { terminal: terminalArgument },
      required: ["terminal"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    _meta: ALWAYS_LOAD,
  },
] as const

const Terminal = Schema.String.check(Schema.isMinLength(1))
const Lines = Schema.optional(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_LINES })),
)

const ReadArgs = Schema.Struct({
  terminal: Terminal,
  view: Schema.optional(Schema.Literals(["output", "screen"])),
  since: Schema.optional(Schema.String),
  max_lines: Lines,
})
const SendArgs = Schema.Struct({
  terminal: Terminal,
  text: Schema.optional(Schema.String),
  enter: Schema.optional(Schema.Boolean),
  keys: Schema.optional(Schema.Array(Schema.String)),
})
const WaitArgs = Schema.Struct({
  terminal: Terminal,
  for: Schema.Literals(["command", "pattern", "quiet"]),
  pattern: Schema.optional(Schema.String),
  since: Schema.optional(Schema.String),
  timeout_ms: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_WAIT_MS })),
  ),
  quiet_ms: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(100))),
  max_lines: Lines,
})
const OpenArgs = Schema.Struct({
  title: Schema.optional(Schema.String),
  command: Schema.optional(Schema.String),
})
const CloseArgs = Schema.Struct({ terminal: Terminal })

const KEYS: Readonly<Record<string, string>> = {
  enter: "\r",
  return: "\r",
  tab: "\t",
  escape: "\x1b",
  esc: "\x1b",
  backspace: "\x7f",
  delete: "\x1b[3~",
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  home: "\x1b[H",
  end: "\x1b[F",
  pageup: "\x1b[5~",
  pagedown: "\x1b[6~",
  space: " ",
}

export const keySequence = (key: string): string | undefined => {
  const name = key.trim().toLowerCase().replaceAll(" ", "")
  const known = KEYS[name]
  if (known !== undefined) return known
  const control = /^(?:ctrl|control|\^)\+?([a-z@[\\\]^_])$/.exec(name)
  const letter = control?.[1]
  return letter === undefined
    ? undefined
    : String.fromCharCode(letter.toUpperCase().charCodeAt(0) & 0x1f)
}

const isHidden = (code: number) =>
  (code < 0x20 && code !== 0x0a) ||
  (code >= 0x7f && code <= 0x9f) ||
  (code >= 0x200b && code <= 0x200f) ||
  (code >= 0x202a && code <= 0x202e) ||
  (code >= 0x2060 && code <= 0x2069) ||
  code === 0xfeff

export const hiddenCharacterIn = (text: string): string | undefined => {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    if (isHidden(code)) return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`
  }
  return undefined
}

const hiddenRefusal = (what: string, character: string) =>
  `${what} has a control or invisible character (${character}), which the human would not see in what they allow. Type keys such as Tab, Escape or Ctrl+C with \`keys\` instead.`

export const typedCommand = (text: string, keys: ReadonlyArray<string>) =>
  [text, ...keys.map((key) => `[${key.trim().toLowerCase()}]`)]
    .filter((part) => part !== "")
    .join(" ")

const describe = (terminal: TerminalInfo): string => {
  const state =
    terminal.state === "exited"
      ? `its shell exited${terminal.exitCode === null ? "" : ` (code ${terminal.exitCode})`}`
      : terminal.state === "restored"
        ? "its shell starts when used"
        : terminal.busy === true
          ? "a command is running"
          : terminal.busy === false
            ? `idle${terminal.lastExitCode === null ? "" : `, the last command exited with ${terminal.lastExitCode}`}`
            : "its shell does not report its commands"
  return [
    `#${terminal.ordinal} "${terminalLabel(terminal)}"`,
    `${terminal.shellName} in ${terminal.cwd}`,
    state,
    terminal.opener === "agent" ? "opened by you" : "opened by the human",
    terminal.location === "checkout" ? "left in the project's checkout" : undefined,
    `id ${terminal.id}`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ")
}

const readText = (read: AgentRead, heading: string) =>
  [
    heading,
    read.dropped ? "(Earlier output scrolled out of the terminal's scrollback.)" : undefined,
    read.truncated ? "(Only the last lines; pass max_lines for more.)" : undefined,
    read.text === "" ? "(Nothing printed.)" : read.text,
    `[cursor: ${read.cursor}]`,
  ]
    .filter((part) => part !== undefined)
    .join("\n")

const waitHeading = (wait: AgentWait, timeoutMs: number): string => {
  switch (wait.outcome) {
    case "command":
      return `The command ended${wait.exitCode === null ? "" : ` with exit code ${wait.exitCode}`}.`
    case "pattern":
      return "The pattern matched."
    case "quiet":
      return "The terminal went quiet."
    case "timeout":
      return `Still waiting after ${Math.round(timeoutMs / 1000)}s; what runs keeps running. Wait again from the cursor below.`
    case "exited":
      return `The terminal's shell exited${wait.exitCode === null ? "" : ` with code ${wait.exitCode}`}.`
    case "unsupported":
      return "This terminal's shell does not report its commands (cmd, WSL): wait for a pattern or for quiet instead."
  }
}

const ok = (text: string): ToolText => ({ text, isError: false })
const fail = (text: string): ToolText => ({ text, isError: true })

export interface TerminalToolsDeps {
  readonly sessionId: SessionId
  readonly terminals: TerminalService["Service"]
  readonly decide: (request: ToolPermissionRequest) => Effect.Effect<PermissionDecision>
}

export const makeTerminalTools = (deps: TerminalToolsDeps) => {
  const { terminals, sessionId } = deps
  const owner = { _tag: "Session", sessionId } as const

  const decode = <S extends Schema.Top>(schema: S, args: unknown) =>
    Schema.decodeUnknownOption(schema as never)(args) as Option.Option<S["Type"]>

  const resolve = (reference: string) =>
    Effect.gen(function* () {
      const listed = yield* terminals.list(owner).pipe(Effect.orElseSucceed(() => []))
      const trimmed = reference.trim().replace(/^#/, "")
      return listed.find((terminal) =>
        /^\d+$/.test(trimmed) ? terminal.ordinal === Number(trimmed) : terminal.id === trimmed,
      )
    })

  const asBash = (command: string, description: string) =>
    deps.decide({
      toolName: SHELL_TOOL,
      input: { command, description },
      toolUseId: `terminal-${randomUUID()}`,
    })

  const noTerminal = (reference: string) =>
    fail(`No terminal ${reference} in this thread. terminal_list shows its terminals.`)

  const invalid = (tool: string) =>
    fail(`The arguments do not match ${tool}'s input schema; see the tool's description.`)

  const list = Effect.map(
    terminals.list(owner).pipe(Effect.orElseSucceed((): ReadonlyArray<TerminalInfo> => [])),
    (listed) =>
      ok(
        listed.length === 0
          ? "This thread has no terminal. terminal_open opens one."
          : listed.map(describe).join("\n"),
      ),
  )

  const read = (args: unknown) =>
    Effect.gen(function* () {
      const parsed = decode(ReadArgs, args)
      if (Option.isNone(parsed)) return invalid("terminal_read")
      const { terminal: reference, view, since, max_lines } = parsed.value
      const terminal = yield* resolve(reference)
      if (terminal === undefined) return noTerminal(reference)
      const result = yield* terminals.agentRead(terminal.id, {
        view: view ?? "output",
        since,
        maxLines: max_lines ?? DEFAULT_MAX_LINES,
      })
      return ok(readText(result, describe(terminal)))
    })

  const send = (args: unknown) =>
    Effect.gen(function* () {
      const parsed = decode(SendArgs, args)
      if (Option.isNone(parsed)) return invalid("terminal_send")
      const { terminal: reference, text = "", keys = [] } = parsed.value
      const enter = text !== "" && (parsed.value.enter ?? true)
      const sequences = keys.map(keySequence)
      const unknown = keys.filter((_, index) => sequences[index] === undefined)
      if (unknown.length > 0) return fail(`Unknown key: ${unknown.join(", ")}.`)
      if (text === "" && keys.length === 0) return fail("Nothing to type: pass `text` or `keys`.")
      const hidden = hiddenCharacterIn(text)
      if (hidden !== undefined) return fail(`Nothing was typed: ${hiddenRefusal("`text`", hidden)}`)
      const terminal = yield* resolve(reference)
      if (terminal === undefined) return noTerminal(reference)

      const shown = typedCommand(text, keys)
      const decision = yield* asBash(
        shown,
        `Typed into terminal #${terminal.ordinal} "${terminalLabel(terminal)}"${enter ? ", then Enter" : ""}`,
      )
      if (decision.behavior === "deny") return fail(`Nothing was typed. ${decision.message}`)
      const cursor = yield* terminals.agentCursor(terminal.id)
      yield* terminals.agentWrite(terminal.id, `${text}${enter ? "\r" : ""}${sequences.join("")}`)
      return ok(
        `Typed into terminal #${terminal.ordinal}. [cursor: ${cursor}] Pass it as \`since\` to terminal_wait or terminal_read.`,
      )
    })

  const wait = (args: unknown) =>
    Effect.gen(function* () {
      const parsed = decode(WaitArgs, args)
      if (Option.isNone(parsed)) return invalid("terminal_wait")
      const options = parsed.value
      let waitFor: WaitFor
      if (options.for === "pattern") {
        if (options.pattern === undefined) return fail("`for: pattern` needs a `pattern`.")
        try {
          waitFor = { _tag: "pattern", pattern: new RegExp(options.pattern, "m") }
        } catch {
          return fail(`Not a valid regular expression: ${options.pattern}`)
        }
      } else if (options.for === "quiet") {
        waitFor = { _tag: "quiet", quietMs: options.quiet_ms ?? DEFAULT_QUIET_MS }
      } else {
        waitFor = { _tag: "command" }
      }
      const terminal = yield* resolve(options.terminal)
      if (terminal === undefined) return noTerminal(options.terminal)
      const timeoutMs = options.timeout_ms ?? DEFAULT_WAIT_MS
      const result = yield* terminals.agentWait(terminal.id, {
        for: waitFor,
        since: options.since,
        timeoutMs,
        maxLines: options.max_lines ?? DEFAULT_MAX_LINES,
      })
      return ok(readText(result, waitHeading(result, timeoutMs)))
    })

  const open = (args: unknown) =>
    Effect.gen(function* () {
      const parsed = decode(OpenArgs, args)
      if (Option.isNone(parsed)) return invalid("terminal_open")
      const command = parsed.value.command?.trim() ?? ""
      const title = parsed.value.title?.trim() || undefined
      const hidden = hiddenCharacterIn(command)
      if (hidden !== undefined) {
        return fail(`No terminal was opened: ${hiddenRefusal("`command`", hidden)}`)
      }
      if (command !== "") {
        const decision = yield* asBash(
          command,
          `Run in a new terminal${title === undefined ? "" : ` "${title}"`}`,
        )
        if (decision.behavior === "deny") return fail(`No terminal was opened. ${decision.message}`)
      }
      const opened = yield* terminals.open(owner, { opener: "agent", title: title ?? null })
      if (command === "") {
        const cursor = yield* terminals.agentCursor(opened.id)
        return ok(`Opened terminal #${opened.ordinal}. [cursor: ${cursor}]`)
      }
      const deadline = Date.now() + OPEN_READY_MS
      while (Date.now() < deadline) {
        const info = yield* terminals.info(opened.id)
        if (info.integration || info.state === "exited") break
        yield* Effect.sleep("100 millis")
      }
      const cursor = yield* terminals.agentCursor(opened.id)
      yield* terminals.agentWrite(opened.id, `${command}\r`)
      return ok(
        `Opened terminal #${opened.ordinal} and ran \`${command}\` in it. [cursor: ${cursor}] terminal_wait with this cursor tells you when it is ready.`,
      )
    }).pipe(
      Effect.catch((error) => Effect.succeed(fail(`No terminal was opened: ${error.message}`))),
    )

  const close = (args: unknown) =>
    Effect.gen(function* () {
      const parsed = decode(CloseArgs, args)
      if (Option.isNone(parsed)) return invalid("terminal_close")
      const terminal = yield* resolve(parsed.value.terminal)
      if (terminal === undefined) return noTerminal(parsed.value.terminal)
      if (terminal.opener !== "agent") {
        const decision = yield* asBash(
          `close terminal #${terminal.ordinal} "${terminalLabel(terminal)}"`,
          "Closes a terminal the human opened, stopping what runs in it",
        )
        if (decision.behavior === "deny")
          return fail(`The terminal stays open. ${decision.message}`)
      }
      yield* terminals.close(terminal.id)
      return ok(`Closed terminal #${terminal.ordinal}.`)
    })

  return (tool: TerminalToolName, args: unknown): Effect.Effect<ToolText> => {
    const run = (): Effect.Effect<ToolText, { readonly message: string }> => {
      switch (tool) {
        case "terminal_list":
          return list
        case "terminal_read":
          return read(args)
        case "terminal_send":
          return send(args)
        case "terminal_wait":
          return wait(args)
        case "terminal_open":
          return open(args)
        case "terminal_close":
          return close(args)
      }
    }
    return run().pipe(Effect.catch((error) => Effect.succeed(fail(error.message))))
  }
}
