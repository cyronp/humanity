import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  DesktopUpdateCommand,
  UpdatePreferences,
  UpdateState,
  UpdateStatus,
} from "../domain/Updates.ts"
import { UpdatesUnavailable } from "../Errors.ts"

/**
 * Updates of the desktop app. The web app reads and asks through the daemon;
 * the desktop app, connected as one more client, does the checking and the
 * installing and reports back.
 */
export const UpdatesRpcs = RpcGroup.make(
  /** The current status, then every change to it. */
  Rpc.make("Updates.watch", {
    success: UpdateStatus,
    stream: true,
  }),
  Rpc.make("Updates.setPreferences", {
    payload: { preferences: UpdatePreferences },
    success: UpdatePreferences,
  }),
  /** Looks for a new version now. The answer arrives through `Updates.watch`. */
  Rpc.make("Updates.check", {
    error: UpdatesUnavailable,
  }),
  /** Downloads the newest version of the track and restarts the app into it. */
  Rpc.make("Updates.install", {
    error: UpdatesUnavailable,
  }),
  /**
   * The desktop app's side: it says which version it runs, then receives
   * commands for as long as it stays connected.
   */
  Rpc.make("Updates.attachDesktop", {
    payload: { version: Schema.String },
    success: DesktopUpdateCommand,
    stream: true,
  }),
  Rpc.make("Updates.report", {
    payload: { state: UpdateState },
  }),
)
