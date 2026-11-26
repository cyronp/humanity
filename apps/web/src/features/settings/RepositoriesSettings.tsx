import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { ArrowDownUp } from "lucide-react"
import { useId } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { githubConnectionAtom } from "@/features/github/atoms"
import { summarizeGitHub } from "@/features/github/connection"
import { GitHubConnect } from "@/features/github/GitHubConnect"
import { GitHubIcon } from "@/features/github/GitHubIcon"
import { gitlabConnectionAtom } from "@/features/gitlab/atoms"
import { summarizeGitLab } from "@/features/gitlab/connection"
import { GitLabConnect } from "@/features/gitlab/GitLabConnect"
import { GitLabIcon } from "@/features/gitlab/GitLabIcon"
import { ToneDot } from "@/components/ToneDot"
import { FETCH_INTERVALS, type FetchInterval, useUiPreferences } from "@/lib/uiPreferences"
import { selectSettingsItem, useSettings } from "./settings.ts"
import { SettingsFrame, SettingsRow, SettingsRows, SettingsSplit } from "./SettingsLayout.tsx"

const SERVICES = ["github", "gitlab", "sync"] as const
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
      description="Connect GitHub or GitLab to list and clone your repositories."
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
          {
            id: "sync",
            label: "Sync",
            icon: <ArrowDownUp className="size-6" aria-hidden="true" />,
          },
        ]}
        selected={selected}
        onSelect={(id) => selectSettingsItem("repositories", id)}
      >
        {selected === "github" ? (
          <GitHubConnect />
        ) : selected === "gitlab" ? (
          <GitLabConnect />
        ) : (
          <SyncSettings />
        )}
      </SettingsSplit>
    </SettingsFrame>
  )
}

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

const intervalLabel = (minutes: FetchInterval) =>
  minutes === 0 ? "Never" : minutes === 1 ? "Every minute" : `Every ${minutes} minutes`

function SyncSettings() {
  const [preferences, change] = useUiPreferences()
  const labelId = useId()
  return (
    <SettingsRows>
      <SettingsRow
        label="Check origin in the background"
        labelId={labelId}
        detail="How often an open thread fetches its repository, to show commits to pull. A background fetch never asks for credentials. Sync always fetches first."
      >
        <Select
          value={String(preferences.fetchMinutes)}
          onValueChange={(value) => change({ fetchMinutes: Number(value) as FetchInterval })}
        >
          <SelectTrigger className="w-44" aria-labelledby={labelId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FETCH_INTERVALS.map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)}>
                {intervalLabel(minutes)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsRows>
  )
}
