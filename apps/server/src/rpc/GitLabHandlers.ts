import { GitLabRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { GitLabService } from "../services/GitLabService.ts"

export const GitLabHandlers = GitLabRpcs.toLayer(
  Effect.gen(function* () {
    const gitlab = yield* GitLabService
    return GitLabRpcs.of({
      "GitLab.connection": ({ refresh }) => gitlab.connection({ refresh }),
      "GitLab.setToken": ({ token, host }) => gitlab.saveToken(token, host.toLowerCase()),
      "GitLab.removeToken": () => gitlab.removeToken,
      "GitLab.listRepos": () => gitlab.listRepos,
      "GitLab.listBranches": ({ fullPath }) => gitlab.listBranches(fullPath),
    })
  }),
)
