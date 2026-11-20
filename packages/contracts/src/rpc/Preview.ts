import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { LocalServer, PreviewProbe } from "../domain/Preview.ts"
import { SessionId } from "../domain/Session.ts"
import {
  LocalServerNotFound,
  LocalServerStopFailed,
  PreviewFileRefused,
  SessionNotFound,
} from "../Errors.ts"

export const PreviewRpcs = RpcGroup.make(
  Rpc.make("Preview.servers", {
    payload: { fast: Schema.Boolean },
    success: Schema.Array(LocalServer),
    stream: true,
  }),
  Rpc.make("Preview.stopServer", {
    payload: { pid: Schema.Int, port: Schema.Int },
    error: Schema.Union([LocalServerNotFound, LocalServerStopFailed]),
  }),
  Rpc.make("Preview.probe", {
    payload: { url: Schema.String, embedder: Schema.String },
    success: PreviewProbe,
  }),
  Rpc.make("Preview.fileUrl", {
    payload: { sessionId: SessionId, path: Schema.String },
    success: Schema.String,
    error: Schema.Union([SessionNotFound, PreviewFileRefused]),
  }),
)
