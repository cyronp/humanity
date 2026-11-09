import { ProjectsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { ProjectService } from "../services/ProjectService.ts"

export const ProjectsHandlers = ProjectsRpcs.toLayer(
  Effect.gen(function* () {
    const projects = yield* ProjectService
    return ProjectsRpcs.of({
      "Projects.list": () => projects.list,
      "Projects.addLocal": ({ path }) => projects.addLocal(path),
      "Projects.remove": ({ projectId }) => projects.remove(projectId),
    })
  }),
)
