import { UpdatesRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { UpdateService } from "../services/UpdateService.ts"

export const UpdatesHandlers = UpdatesRpcs.toLayer(
  Effect.gen(function* () {
    const updates = yield* UpdateService
    return UpdatesRpcs.of({
      "Updates.watch": () => updates.watch,
      "Updates.setPreferences": ({ preferences }) => updates.setPreferences(preferences),
      "Updates.check": () => updates.check,
      "Updates.install": () => updates.install,
      "Updates.attachDesktop": ({ version }) => updates.attachDesktop(version),
      "Updates.report": ({ state }) => updates.report(state),
    })
  }),
)
