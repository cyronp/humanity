import { ProjectsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { PolicyService } from "../services/PolicyService.ts"
import { ProjectService } from "../services/ProjectService.ts"
import { SessionService } from "../services/SessionService.ts"

export const ProjectsHandlers = ProjectsRpcs.toLayer(
  Effect.gen(function* () {
    const projects = yield* ProjectService
    const sessions = yield* SessionService
    const policies = yield* PolicyService
    return ProjectsRpcs.of({
      "Projects.list": () => projects.list,
      "Projects.addLocal": ({ path }) => projects.addLocal(path),
      "Projects.cloneFromGitHub": ({ fullName }) => projects.cloneFromGitHub(fullName),
      // Stop the project's agents before their worktrees disappear.
      "Projects.remove": ({ projectId }) =>
        Effect.andThen(sessions.stopProject(projectId), projects.remove(projectId)),
      "Projects.getPolicy": ({ projectId }) => policies.get(projectId),
      "Projects.setPolicy": ({ projectId, policy }) => policies.set(projectId, policy),
    })
  }),
)
