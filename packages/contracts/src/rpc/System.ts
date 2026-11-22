import { Rpc, RpcGroup } from "effect/rpc"
import { RecordingsUsage, SystemFolder, SystemInfo } from "../domain/System.ts"
import { FolderOpenFailed } from "../Errors.ts"

export const SystemRpcs = RpcGroup.make(
  Rpc.make("System.info", {
    success: SystemInfo,
  }),
  Rpc.make("System.openFolder", {
    payload: { folder: SystemFolder },
    error: FolderOpenFailed,
  }),
  Rpc.make("System.recordings", {
    success: RecordingsUsage,
  }),
  Rpc.make("System.clearRecordings", {
    success: RecordingsUsage,
  }),
)
