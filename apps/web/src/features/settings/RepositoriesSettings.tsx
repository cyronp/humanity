import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { githubConnectionAtom } from "@/features/github/atoms"
import { summarizeGitHub } from "@/features/github/connection"
import { GitHubConnect } from "@/features/github/GitHubConnect"
import { GitHubIcon } from "@/features/github/GitHubIcon"
import { gitlabConnectionAtom } from "@/features/gitlab/atoms"
import { summarizeGitLab } from "@/features/gitlab/connection"
import { GitLabConnect } from "@/features/gitlab/GitLabConnect"
import { GitLabIcon } from "@/features/gitlab/GitLabIcon"
import { ToneDot } from "@/features/claude/ToneDot"
import { selectSettingsItem, useSettings } from "./settings.ts"
import { SettingsFrame, SettingsSplit } from "./SettingsLayout.tsx"

const SERVICES = ["github", "gitlab"] as const
type Service = (typeof SERVICES)[number]

export function RepositoriesSettings() {
  const { items } = useSettings()
  const selected: Service = SERVICES.find((id) => id === items.repositories) ?? "github"
  const github = useAtomValue(githubConnectionAtom)
  const gitlab = useAtomValue(gitlabConnectionAtom)

  return (
    <SettingsFrame
      id="settings-repositories"
      title="Repositories"
      description="Where projects come from. Once GitHub or GitLab is connected, Humanity lists your repositories there and clones the one you pick, private ones included. Both can be connected at once."
    >
      <SettingsSplit
        label="Repository services"
        items={[
          {
            id: "github",
            label: "GitHub",
            icon: <GitHubIcon className="size-7" />,
            status: AsyncResult.isSuccess(github) ? (
              <Status {...summarizeGitHub(github.value)} />
            ) : undefined,
          },
          {
            id: "gitlab",
            label: "GitLab",
            icon: <GitLabIcon className="size-7" />,
            status: AsyncResult.isSuccess(gitlab) ? (
              <Status {...summarizeGitLab(gitlab.value)} />
            ) : undefined,
          },
        ]}
        selected={selected}
        onSelect={(id) => selectSettingsItem("repositories", id)}
      >
        {selected === "github" ? <GitHubConnect /> : <GitLabConnect />}
      </SettingsSplit>
    </SettingsFrame>
  )
}

/** Whether a service is connected: a light, with its meaning for screen readers and on hover. */
function Status({
  tone,
  title,
}: {
  readonly tone: "ok" | "warning" | "error"
  readonly title: string
}) {
  return (
    <span title={title} className="flex shrink-0 items-center">
      <ToneDot tone={tone} />
      <span className="sr-only">{title}</span>
    </span>
  )
}
