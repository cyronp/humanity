import { GitHubConnect } from "@/features/github/GitHubConnect"

export function RepositoriesStep() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Connect your repositories</h2>
        <p className="max-w-prose text-muted-foreground">
          Projects come from GitHub: once it is connected, Humanity lists your repositories and
          clones the one you pick, private ones included. Choose either way to connect.
        </p>
      </div>
      <GitHubConnect />
      <p className="text-xs text-muted-foreground">
        This step is optional. Public repositories and folders already on this computer can be added
        without it, and you can change it later in Settings, at the bottom of the sidebar.
      </p>
    </div>
  )
}
