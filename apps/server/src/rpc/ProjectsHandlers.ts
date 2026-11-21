import { ProjectsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { HistoryImport } from "../services/HistoryImport.ts"
import { ProjectService } from "../services/ProjectService.ts"
import { SessionEvents } from "../services/SessionEvents.ts"
import { SessionService } from "../services/SessionService.ts"

export const ProjectsHandlers = ProjectsRpcs.toLayer(
  Effect.gen(function* () {
    const projects = yield* ProjectService
    const sessions = yield* SessionService
    const events = yield* SessionEvents
    const imports = yield* HistoryImport
    return ProjectsRpcs.of({
      "Projects.list": () => projects.list,
      "Projects.addLocal": ({ path }) =>
        Effect.tap(projects.addLocal(path), (project) => imports.syncInBackground(project.id)),
      "Projects.listFolders": ({ folder, prefix }) => projects.listFolders(folder, prefix),
      "Projects.cloneFromGitHub": ({ fullName }) => projects.cloneFromGitHub(fullName),
      "Projects.cloneFromGitLab": ({ fullPath }) => projects.cloneFromGitLab(fullPath),
      "Projects.remove": ({ projectId }) =>
        Effect.andThen(sessions.stopProject(projectId), projects.remove(projectId)).pipe(
          Effect.andThen(events.publishListChanged),
        ),
      "Projects.icon": ({ projectId }) => projects.icon(projectId),
      "Projects.setDefaultAutonomy": ({ projectId, autonomy }) =>
        projects.setDefaultAutonomy(projectId, autonomy),
      "Projects.rename": ({ projectId, name }) =>
        Effect.tap(projects.rename(projectId, name), () => events.publishListChanged),
      "Projects.setSettings": ({ projectId, settings }) =>
        projects.setSettings(projectId, settings),
    })
  }),
)
