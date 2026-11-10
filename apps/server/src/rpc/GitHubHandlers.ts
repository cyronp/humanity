import { GitHubRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { GitHubService } from "../services/GitHubService.ts"

export const GitHubHandlers = GitHubRpcs.toLayer(
  Effect.gen(function* () {
    const github = yield* GitHubService
    return GitHubRpcs.of({
      "GitHub.whoami": () => github.whoami,
      "GitHub.listRepos": () => github.listRepos,
      "GitHub.listBranches": ({ fullName }) => github.listBranches(fullName),
    })
  }),
)
