import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  DesktopUpdateCommand,
  UpdatePreferences,
  UpdateState,
  UpdateStatus,
} from "../domain/Updates.ts"
import { UpdatesUnavailable } from "../Errors.ts"

export const UpdatesRpcs = RpcGroup.make(
  Rpc.make("Updates.watch", {
    success: UpdateStatus,
    stream: true,
  }),
  Rpc.make("Updates.setPreferences", {
    payload: { preferences: UpdatePreferences },
    success: UpdatePreferences,
  }),
  Rpc.make("Updates.check", {
    error: UpdatesUnavailable,
  }),
  Rpc.make("Updates.install", {
    error: UpdatesUnavailable,
  }),
  Rpc.make("Updates.attachDesktop", {
    payload: { version: Schema.String },
    success: DesktopUpdateCommand,
    stream: true,
  }),
  Rpc.make("Updates.report", {
    payload: { state: UpdateState },
  }),
)
