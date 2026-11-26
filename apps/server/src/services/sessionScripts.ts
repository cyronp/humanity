import { CHECKS_OUTPUT_LINES, CHECKS_TIMEOUT_MS, type SessionId } from "@humanity/contracts"
import { Clock, Effect } from "effect"
import type { TerminalService } from "../terminal/TerminalService.ts"
import { withoutPromptLine } from "./sessionHelpers.ts"

const SHELL_READY_MS = 15_000
const SHELL_READY_POLL_MS = 100

type Terminals = TerminalService["Service"]

const shellReady = (terminals: Terminals, terminalId: string) =>
  Effect.gen(function* () {
    const deadline = (yield* Clock.currentTimeMillis) + SHELL_READY_MS
    for (;;) {
      const info = yield* terminals.info(terminalId)
      if (info.integration) return true
      if (info.state === "exited") return false
      if ((yield* Clock.currentTimeMillis) >= deadline) return false
      yield* Effect.sleep(SHELL_READY_POLL_MS)
    }
  })

export const runChecksIn = (terminals: Terminals, sessionId: SessionId, command: string) =>
  Effect.gen(function* () {
    const terminal = yield* terminals.open(
      { _tag: "Session", sessionId },
      { opener: "human", title: "Checks" },
    )
    const tracked = yield* shellReady(terminals, terminal.id)
    const cursor = yield* terminals.agentCursor(terminal.id)
    yield* terminals.agentWrite(terminal.id, `${command}\r`)
    if (!tracked) {
      return {
        terminalId: terminal.id,
        command,
        outcome: "untracked" as const,
        exitCode: null,
        output: "",
      }
    }
    const waited = yield* terminals.agentWait(terminal.id, {
      for: { _tag: "command" },
      since: cursor,
      timeoutMs: CHECKS_TIMEOUT_MS,
      maxLines: CHECKS_OUTPUT_LINES,
    })
    const outcome =
      waited.outcome === "timeout"
        ? ("timeout" as const)
        : waited.outcome === "unsupported"
          ? ("untracked" as const)
          : waited.exitCode === 0
            ? ("passed" as const)
            : ("failed" as const)
    return {
      terminalId: terminal.id,
      command,
      outcome,
      exitCode: waited.exitCode,
      output: waited.outcome === "command" ? withoutPromptLine(waited.text) : waited.text,
    }
  })
