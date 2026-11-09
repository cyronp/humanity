import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { HunkStatus } from "@humanity/contracts"
import { packageName } from "@humanity/diff"

const program = Effect.gen(function* () {
  yield* Effect.logInfo("Humanity daemon scaffold is running", {
    diff: packageName,
    statuses: HunkStatus.literals,
  })
  return yield* Effect.never
})

NodeRuntime.runMain(program)
