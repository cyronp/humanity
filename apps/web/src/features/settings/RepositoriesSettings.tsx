import { GitHubConnect } from "@/features/github/GitHubConnect"
import { GitLabConnect } from "@/features/gitlab/GitLabConnect"

export function RepositoriesSettings() {
  return (
    <section aria-labelledby="settings-repositories" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="settings-repositories" className="text-base font-medium">
          Repositories
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Where projects come from. Once GitHub or GitLab is connected, Humanity lists your
          repositories there and clones the one you pick, private ones included. Both can be
          connected at once.
        </p>
      </div>
      <GitHubConnect />
      <GitLabConnect />
    </section>
  )
}
