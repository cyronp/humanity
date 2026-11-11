import { ProjectsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { HistoryImport } from "../services/HistoryImport.ts"
import { PolicyService } from "../services/PolicyService.ts"
import { ProjectService } from "../services/ProjectService.ts"
import { SessionEvents } from "../services/SessionEvents.ts"
import { SessionService } from "../services/SessionService.ts"

export const ProjectsHandlers = ProjectsRpcs.toLayer(
  Effect.gen(function* () {
    const projects = yield* ProjectService
    const sessions = yield* SessionService
    const policies = yield* PolicyService
    const events = yield* SessionEvents
    const imports = yield* HistoryImport
    return ProjectsRpcs.of({
      "Projects.list": () => projects.list,
      // Its conversations from the Claude Code CLI follow into the thread history.
      "Projects.addLocal": ({ path }) =>
        Effect.tap(projects.addLocal(path), (project) => imports.syncInBackground(project.id)),
      "Projects.cloneFromGitHub": ({ fullName }) => projects.cloneFromGitHub(fullName),
      // Stop the project's agents before their worktrees disappear.
      "Projects.remove": ({ projectId }) =>
        Effect.andThen(sessions.stopProject(projectId), projects.remove(projectId)).pipe(
          // Its sessions went with it.
          Effect.andThen(events.publishListChanged),
        ),
      "Projects.icon": ({ projectId }) => projects.icon(projectId),
      "Projects.getPolicy": ({ projectId }) => policies.get(projectId),
      "Projects.setPolicy": ({ projectId, policy }) => policies.set(projectId, policy),
    })
  }),
)
