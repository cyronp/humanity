import { GitRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { FileSearchService } from "../services/FileSearchService.ts"
import { GitService } from "../services/GitService.ts"
import { ProjectService } from "../services/ProjectService.ts"

export const GitHandlers = GitRpcs.toLayer(
  Effect.gen(function* () {
    const projects = yield* ProjectService
    const files = yield* FileSearchService
    const git = yield* GitService

    return GitRpcs.of({
      "Git.branches": ({ projectId }) =>
        Effect.flatMap(projects.get(projectId), (project) => git.listBranches(project.localPath)),
      "Git.searchFiles": ({ projectId, query, recent }) =>
        Effect.flatMap(projects.get(projectId), (project) =>
          files.search(project.localPath, query, recent),
        ),
    })
  }),
)
