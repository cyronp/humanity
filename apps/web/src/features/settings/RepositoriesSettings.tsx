import { GitHubConnect } from "@/features/github/GitHubConnect"

export function RepositoriesSettings() {
  return (
    <section aria-labelledby="settings-repositories" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="settings-repositories" className="text-base font-medium">
          Repositories
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Where projects come from. Once GitHub is connected, Humanity lists your repositories and
          clones the one you pick, private ones included.
        </p>
      </div>
      <GitHubConnect />
    </section>
  )
}
