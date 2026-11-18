import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { SessionId } from "../domain/Session.ts"
import { ShellInfo, TerminalAttachEvent, TerminalId, TerminalInfo } from "../domain/Terminal.ts"
import { SessionEnded, SessionNotFound, TerminalNotFound, TerminalSpawnFailed } from "../Errors.ts"

const Size = { cols: Schema.Int, rows: Schema.Int }

export const TerminalsRpcs = RpcGroup.make(
  Rpc.make("Terminals.list", {
    payload: { sessionId: SessionId },
    success: Schema.Array(TerminalInfo),
    error: SessionNotFound,
  }),
  /** The thread's terminals now, then again whenever one opens, closes or changes. */
  Rpc.make("Terminals.watch", {
    payload: { sessionId: SessionId },
    success: Schema.Array(TerminalInfo),
    error: SessionNotFound,
    stream: true,
  }),
  /** Opens a terminal in the thread's folder, with `shell` or the one picked in Settings. */
  Rpc.make("Terminals.open", {
    payload: { sessionId: SessionId, shell: Schema.NullOr(Schema.String) },
    success: TerminalInfo,
    error: Schema.Union([SessionNotFound, SessionEnded, TerminalSpawnFailed]),
  }),
  Rpc.make("Terminals.close", {
    payload: { terminalId: TerminalId },
    error: TerminalNotFound,
  }),
  Rpc.make("Terminals.rename", {
    payload: { terminalId: TerminalId, title: Schema.NullOr(Schema.String) },
    success: TerminalInfo,
    error: TerminalNotFound,
  }),
  /** Stops the terminal's process if it runs and starts a fresh shell where it was. */
  Rpc.make("Terminals.restart", {
    payload: { terminalId: TerminalId },
    success: TerminalInfo,
    error: Schema.Union([TerminalNotFound, TerminalSpawnFailed]),
  }),
  /**
   * The terminal's screen, then what it prints. `attachmentId` is the caller's own id for this
   * view, which it acknowledges output with. Attaching to a restored terminal starts its shell.
   */
  Rpc.make("Terminals.attach", {
    payload: { terminalId: TerminalId, attachmentId: Schema.String, ...Size },
    success: TerminalAttachEvent,
    error: Schema.Union([TerminalNotFound, TerminalSpawnFailed]),
    stream: true,
  }),
  /** The human's keystrokes and pastes; they reach no permission check. */
  Rpc.make("Terminals.write", {
    payload: { terminalId: TerminalId, data: Schema.String },
    error: TerminalNotFound,
  }),
  Rpc.make("Terminals.resize", {
    payload: { terminalId: TerminalId, ...Size },
    error: TerminalNotFound,
  }),
  /** The view has shown everything up to `seq`. */
  Rpc.make("Terminals.ack", {
    payload: { terminalId: TerminalId, attachmentId: Schema.String, seq: Schema.Number },
  }),
  Rpc.make("Terminals.shells", {
    success: Schema.Array(ShellInfo),
  }),
)
