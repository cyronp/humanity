import { GitRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { GitService } from "../services/GitService.ts"
import { ProjectService } from "../services/ProjectService.ts"

/**
 * Git RPCs act on the project's own repository, read-only apart from creating
 * a branch ref. Nothing here checks out or edits the user's working copy.
 */
export const GitHandlers = GitRpcs.toLayer(
  Effect.gen(function* () {
    const projects = yield* ProjectService
    const git = yield* GitService

    return GitRpcs.of({
      "Git.branches": ({ projectId }) =>
        Effect.flatMap(projects.get(projectId), (project) => git.listBranches(project.localPath)),
      "Git.createBranch": ({ projectId, name, from }) =>
        Effect.flatMap(projects.get(projectId), (project) =>
          git.createBranch(project.localPath, name.trim(), from ?? project.defaultBranch),
        ),
      "Git.status": ({ projectId }) =>
        Effect.flatMap(projects.get(projectId), (project) => git.status(project.localPath)),
      "Git.diff": ({ projectId }) =>
        Effect.flatMap(projects.get(projectId), (project) => git.diff(project.localPath)),
    })
  }),
)
