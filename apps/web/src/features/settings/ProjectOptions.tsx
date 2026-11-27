import {
  isBranchPrefix,
  MAX_PROJECT_NAME_LENGTH,
  MAX_SETUP_SCRIPT_LENGTH,
  type MergeMethod,
  type Project,
  type ProjectSettings,
  type WorktreeOnEnd,
} from "@humanity/contracts"
import { useId, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { renameProjectAtom, setProjectSettingsAtom } from "@/features/projects/atoms"
import { keys } from "@/lib/rpc"
import { CommitInput } from "@/components/CommitInput"
import { ModelDefaultSelect } from "./ModelDefaultSelect.tsx"
import { SettingsGroup, SettingsRow, SettingsRows } from "./SettingsLayout.tsx"
import { SwitchSetting } from "./SettingsFields.tsx"
import { useAction } from "@/lib/useAction"

const ASK = "ask"

const MERGE_METHODS: ReadonlyArray<{ readonly value: MergeMethod; readonly label: string }> = [
  { value: "squash", label: "Squash and merge" },
  { value: "merge", label: "Merge commit" },
  { value: "rebase", label: "Rebase and merge" },
]

const ON_END: ReadonlyArray<{ readonly value: WorktreeOnEnd; readonly label: string }> = [
  { value: "ask", label: "Ask me" },
  { value: "keep", label: "Keep it" },
  { value: "remove", label: "Delete it" },
]

const useProjectSettings = (project: Project) => {
  const { run: save, error } = useAction(setProjectSettingsAtom)
  const change = async (patch: Partial<ProjectSettings>) => {
    await save({
      payload: { projectId: project.id, settings: { ...project.settings, ...patch } },
      reactivityKeys: [keys.projects],
    })
  }
  return { change, error }
}

export function ProjectName({ project }: { readonly project: Project }) {
  const { run: rename, error } = useAction(renameProjectAtom)
  const labelId = useId()

  const save = async (name: string) => {
    await rename({
      payload: { projectId: project.id, name },
      reactivityKeys: [keys.projects],
    })
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex min-h-10 items-center justify-between gap-6">
        <dt id={labelId} className="shrink-0">
          Name
        </dt>
        <dd>
          <CommitInput
            aria-labelledby={labelId}
            className="w-64"
            maxLength={MAX_PROJECT_NAME_LENGTH}
            value={project.name}
            revertOnEscape
            onCommit={(next) => {
              if (next === "") return false
              if (next !== project.name) void save(next)
            }}
          />
        </dd>
      </div>
      {error !== undefined && <ErrorNote title="The project was not renamed" message={error} />}
    </div>
  )
}

export function ProjectModel({ project }: { readonly project: Project }) {
  const { change, error } = useProjectSettings(project)
  const labelId = useId()
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id={labelId} className="text-sm font-medium">
            Model for new threads
          </h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            Comes before your own default under Chat.
          </p>
        </div>
        <ModelDefaultSelect
          value={project.settings.defaultModel}
          onChange={(defaultModel) => void change({ defaultModel })}
          noneLabel="My default"
          labelledBy={labelId}
        />
      </div>
      {error !== undefined && <ErrorNote title="The model was not saved" message={error} />}
    </section>
  )
}

export function ProjectWorktrees({ project }: { readonly project: Project }) {
  const { change, error } = useProjectSettings(project)
  const { settings } = project
  const prefixId = useId()
  const scriptId = useId()
  const checksId = useId()
  const endId = useId()
  const [prefixError, setPrefixError] = useState<string>()

  return (
    <SettingsGroup title="Worktrees">
      <SettingsRows>
        <SwitchSetting
          label="Start new threads in a worktree"
          detail="Each new thread gets its own worktree and branch, leaving your checkout alone."
          checked={settings.worktreeForNewThreads}
          onCheckedChange={(worktreeForNewThreads) => void change({ worktreeForNewThreads })}
        />
        <SettingsRow
          label="Branch prefix"
          labelId={prefixId}
          detail={
            prefixError ??
            `A worktree's branch is named ${settings.branchPrefix}<id>-<title>. Empty leaves no prefix.`
          }
        >
          <CommitInput
            aria-labelledby={prefixId}
            aria-invalid={prefixError !== undefined}
            className="w-40 font-mono text-xs"
            value={settings.branchPrefix}
            onCommit={(next) => {
              if (!isBranchPrefix(next)) {
                setPrefixError(
                  "Use letters, numbers, dots, dashes and slashes, up to 40 characters, as in feat/.",
                )
                return
              }
              setPrefixError(undefined)
              if (next !== settings.branchPrefix) void change({ branchPrefix: next })
            }}
          />
        </SettingsRow>
        <SettingsRow
          label="Setup script"
          labelId={scriptId}
          stacked
          detail="Runs in a terminal of the thread each time a worktree is set up, one command per line, such as installing dependencies. It runs as you, like a command you typed."
        >
          <Textarea
            key={settings.setupScript ?? ""}
            aria-labelledby={scriptId}
            className="font-mono text-xs"
            rows={3}
            maxLength={MAX_SETUP_SCRIPT_LENGTH}
            placeholder={"npm install\ncp ../.env .env"}
            defaultValue={settings.setupScript ?? ""}
            onBlur={(event) => {
              const next = event.currentTarget.value
              const saved = settings.setupScript ?? ""
              if (next.trim() !== saved.trim()) {
                void change({ setupScript: next.trim() === "" ? null : next })
              }
            }}
          />
        </SettingsRow>
        <SettingsRow
          label="Checks"
          labelId={checksId}
          stacked
          detail="Run checks, in Source control, runs these in a new terminal of the thread, one command per line, each only if the one before passed. When they fail, their output can go into your message. They run as you, like a command you typed."
        >
          <Textarea
            key={settings.checkScript ?? ""}
            aria-labelledby={checksId}
            className="font-mono text-xs"
            rows={3}
            maxLength={MAX_SETUP_SCRIPT_LENGTH}
            placeholder={"npm run lint\nnpm run typecheck\nnpm test"}
            defaultValue={settings.checkScript ?? ""}
            onBlur={(event) => {
              const next = event.currentTarget.value
              const saved = settings.checkScript ?? ""
              if (next.trim() !== saved.trim()) {
                void change({ checkScript: next.trim() === "" ? null : next })
              }
            }}
          />
        </SettingsRow>
        <SettingsRow
          label="When a thread ends"
          labelId={endId}
          detail="What happens to its worktree. Its branch is kept either way."
        >
          <Select
            value={settings.worktreeOnEnd}
            onValueChange={(value) => void change({ worktreeOnEnd: value as WorktreeOnEnd })}
          >
            <SelectTrigger className="w-40" aria-labelledby={endId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ON_END.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsRows>
      {error !== undefined && <ErrorNote title="The setting was not saved" message={error} />}
    </SettingsGroup>
  )
}

export function ProjectTrust({ project }: { readonly project: Project }) {
  const { change, error } = useProjectSettings(project)

  return (
    <SettingsGroup title="Repository settings">
      <SettingsRows>
        <SwitchSetting
          label="Use this repository's Claude Code settings"
          detail="Its .claude/settings.json can run programs of its own, such as hooks, MCP servers and plugins, before a thread's permissions decide anything. Until you turn this on, a Claude Code thread does not start in a repository whose settings would."
          checked={project.settings.trustRepositorySettings}
          onCheckedChange={(trustRepositorySettings) => void change({ trustRepositorySettings })}
        />
      </SettingsRows>
      {error !== undefined && <ErrorNote title="The setting was not saved" message={error} />}
    </SettingsGroup>
  )
}

export function ProjectPullRequests({ project }: { readonly project: Project }) {
  const { change, error } = useProjectSettings(project)
  const { settings } = project
  const methodId = useId()
  const gitlab = project.gitlab !== null

  return (
    <SettingsGroup title={gitlab ? "Merge requests" : "Pull requests"}>
      <SettingsRows>
        <SettingsRow
          label="Merge method"
          labelId={methodId}
          detail={
            gitlab
              ? "Offered first when you merge. GitLab merges by the project's own method, with or without a squash."
              : "Offered first when you merge."
          }
        >
          <Select
            value={settings.mergeMethod ?? ASK}
            onValueChange={(value) =>
              void change({
                mergeMethod: MERGE_METHODS.find((option) => option.value === value)?.value ?? null,
              })
            }
          >
            <SelectTrigger className="w-48" aria-labelledby={methodId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ASK}>No preference</SelectItem>
              {MERGE_METHODS.filter((option) => !gitlab || option.value !== "rebase").map(
                (option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SwitchSetting
          label="Open as a draft"
          detail="Checks Draft when you open one. You can still change it each time."
          checked={settings.draftPullRequests}
          onCheckedChange={(draftPullRequests) => void change({ draftPullRequests })}
        />
      </SettingsRows>
      {error !== undefined && <ErrorNote title="The setting was not saved" message={error} />}
    </SettingsGroup>
  )
}
