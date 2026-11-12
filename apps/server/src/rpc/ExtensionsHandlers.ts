import { ExtensionsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { ExtensionsService } from "../services/ExtensionsService.ts"
import { ProjectService } from "../services/ProjectService.ts"

export const ExtensionsHandlers = ExtensionsRpcs.toLayer(
  Effect.gen(function* () {
    const extensions = yield* ExtensionsService
    const projects = yield* ProjectService
    return ExtensionsRpcs.of({
      "Extensions.list": ({ projectId }) =>
        projectId === null
          ? extensions.list(undefined)
          : Effect.flatMap(projects.get(projectId), (project) =>
              extensions.list(project.localPath),
            ),
      "Extensions.saveMcpServer": ({ previousName, name, transport }) =>
        extensions.saveMcpServer(previousName, name, transport),
      "Extensions.importMcpServers": ({ json }) => extensions.importMcpServers(json),
      "Extensions.setMcpServerEnabled": ({ name, enabled }) =>
        extensions.setMcpServerEnabled(name, enabled),
      "Extensions.removeMcpServer": ({ name }) => extensions.removeMcpServer(name),
      "Extensions.saveSkill": ({ previousName, skill }) =>
        extensions.saveSkill(previousName, skill),
      "Extensions.removeSkill": ({ name }) => extensions.removeSkill(name),
    })
  }),
)
