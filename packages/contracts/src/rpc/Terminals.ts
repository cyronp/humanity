import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  ShellInfo,
  TerminalAttachEvent,
  TerminalColors,
  TerminalId,
  TerminalInfo,
  TerminalOwner,
} from "../domain/Terminal.ts"
import {
  ProjectNotFound,
  SessionEnded,
  SessionNotFound,
  TerminalNotFound,
  TerminalSpawnFailed,
} from "../Errors.ts"

const Size = { cols: Schema.Int, rows: Schema.Int }
const OwnerNotFound = Schema.Union([SessionNotFound, ProjectNotFound])

export const TerminalsRpcs = RpcGroup.make(
  Rpc.make("Terminals.list", {
    payload: { owner: TerminalOwner },
    success: Schema.Array(TerminalInfo),
    error: OwnerNotFound,
  }),
  Rpc.make("Terminals.watch", {
    payload: { owner: TerminalOwner },
    success: Schema.Array(TerminalInfo),
    error: OwnerNotFound,
    stream: true,
  }),
  Rpc.make("Terminals.open", {
    payload: { owner: TerminalOwner, shell: Schema.NullOr(Schema.String) },
    success: TerminalInfo,
    error: Schema.Union([SessionNotFound, ProjectNotFound, SessionEnded, TerminalSpawnFailed]),
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
  Rpc.make("Terminals.restart", {
    payload: { terminalId: TerminalId },
    success: TerminalInfo,
    error: Schema.Union([TerminalNotFound, TerminalSpawnFailed]),
  }),
  Rpc.make("Terminals.attach", {
    payload: { terminalId: TerminalId, attachmentId: Schema.String, ...Size },
    success: TerminalAttachEvent,
    error: Schema.Union([TerminalNotFound, TerminalSpawnFailed]),
    stream: true,
  }),
  Rpc.make("Terminals.write", {
    payload: { terminalId: TerminalId, data: Schema.String },
    error: TerminalNotFound,
  }),
  Rpc.make("Terminals.resize", {
    payload: { terminalId: TerminalId, ...Size },
    error: TerminalNotFound,
  }),
  Rpc.make("Terminals.ack", {
    payload: { terminalId: TerminalId, attachmentId: Schema.String, seq: Schema.Number },
  }),
  Rpc.make("Terminals.setColors", {
    payload: { colors: TerminalColors },
  }),
  Rpc.make("Terminals.shells", {
    success: Schema.Array(ShellInfo),
  }),
)
