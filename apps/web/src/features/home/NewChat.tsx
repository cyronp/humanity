import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  Autonomy,
  Project,
  ProjectId,
  ReasoningEffort,
  Session,
  TerminalOwner,
} from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { COMPARE_RUNS } from "@humanity/contracts"
import { FolderPlus } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AddMenu } from "@/features/chat/AddMenu"
import { KeyHint, SendButton } from "@/features/chat/ChatBox"
import { PromptBox, usePromptDraft } from "@/features/chat/PromptBox"
import { compareRuns, openCompare } from "@/features/compare/compare"
import { branchesAtom, searchProjectFilesAtom } from "@/features/git/atoms"
import { BranchPicker } from "@/features/git/BranchPicker"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { WorkspaceFrame } from "@/features/layout/WorkspaceFrame"
import { AutonomyPicker } from "@/features/policy/AutonomyPicker"
import { openAddRepository } from "@/features/projects/addRepository"
import { projectsAtom } from "@/features/projects/atoms"
import { ModelPicker } from "@/features/providers/ModelPicker"
import type { ModelChoice } from "@/features/providers/models"
import { allSessionsAtom, createGroupAtom, createSessionAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { PROVIDER_IDS } from "@/features/providers/ProviderIcon"
import { useProviderStatuses } from "@/features/providers/useProviderModels"
import { usePinnedDefaults } from "./pinnedDefaults.ts"
import { type ThreadDefaults, threadDefaults } from "./threadDefaults.ts"

export function NewChat({
  projectId,
  initialPrompt,
}: {
  readonly projectId: ProjectId | undefined
  readonly initialPrompt?: string | undefined
}) {
  const projects = useAtomValue(projectsAtom)
  const sessions = useAtomValue(allSessionsAtom)
  const statuses = useProviderStatuses()
  const list = AsyncResult.isSuccess(projects) ? projects.value : []
  const recent = AsyncResult.isSuccess(sessions) ? sessions.value : []
  const lastProjectId = lastPrompted(recent)
  const { pinned } = usePinnedDefaults()
  const project =
    list.find((candidate) => candidate.id === projectId) ??
    list.find((candidate) => candidate.id === lastProjectId) ??
    list[0]
  const defaults = threadDefaults(
    recent,
    Object.fromEntries(
      PROVIDER_IDS.flatMap((provider) => {
        const status = statuses[provider]
        return AsyncResult.isSuccess(status) ? [[provider, status.value.models]] : []
      }),
    ),
    pinned,
    project,
  )

  const loaded = AsyncResult.isSuccess(projects)
  const projectKey = project?.id
  const terminalOwner = useMemo(
    (): TerminalOwner | undefined =>
      !loaded
        ? undefined
        : projectKey === undefined
          ? { _tag: "Home" }
          : { _tag: "Project", projectId: projectKey },
    [loaded, projectKey],
  )

  return (
    <WorkspaceFrame
      terminals={terminalOwner === undefined ? undefined : { owner: terminalOwner }}
      header={(actions) => (
        <AppHeader actions={actions}>
          <ProjectBreadcrumb project={project} />
        </AppHeader>
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="my-auto flex flex-col items-center gap-6 px-4 pt-14 pb-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">What should we work on?</h1>
          </div>
          {AsyncResult.match(projects, {
            onInitial: () => <Skeleton className="h-32 w-full max-w-2xl rounded-2xl" />,
            onFailure: ({ cause }) => (
              <div className="w-full max-w-2xl">
                <ErrorNote title="Could not load projects" message={describeCause(cause)} />
              </div>
            ),
            onSuccess: () =>
              project === undefined ? (
                <NoProjects />
              ) : (
                <NewChatForm project={project} defaults={defaults} initialPrompt={initialPrompt} />
              ),
          })}
        </div>
      </div>
    </WorkspaceFrame>
  )
}

const lastPrompted = (sessions: ReadonlyArray<Session>): ProjectId | undefined =>
  sessions[0]?.projectId

function NoProjects() {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">Add a repository to get started.</p>
      <Button onClick={openAddRepository}>
        <FolderPlus />
        Add repository
      </Button>
    </div>
  )
}

function NewChatForm({
  project,
  defaults,
  initialPrompt,
}: {
  readonly project: Project
  readonly defaults: ThreadDefaults
  readonly initialPrompt: string | undefined
}) {
  const create = useAtomSet(createSessionAtom, { mode: "promiseExit" })
  const createGroup = useAtomSet(createGroupAtom, { mode: "promiseExit" })
  const [extra, setExtra] = useState<ReadonlyArray<ModelChoice>>([])
  const navigate = useNavigate()
  const [chosenModel, setModel] = useState<ModelChoice>()
  const [chosenEffort, setEffort] = useState<ReasoningEffort | null>()
  const [chosenAutonomy, setAutonomy] = useState<Autonomy>()
  const { provider, model } = chosenModel ?? defaults
  const effort = chosenEffort === undefined ? defaults.effort : chosenEffort
  const autonomy = chosenAutonomy ?? defaults.autonomy
  const [chosenBranch, setChosenBranch] = useState<{ projectId: ProjectId; name: string }>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const searchFiles = useAtomSet(searchProjectFilesAtom, { mode: "promiseExit" })
  const draft = usePromptDraft({
    initialText: initialPrompt ?? "",
    search: (query, recent) => searchFiles({ payload: { projectId: project.id, query, recent } }),
    recentScope: project.id,
    disabled: pending,
  })
  const { text, files, insert } = draft

  const branches = useAtomValue(branchesAtom(project.id))
  const chosen = chosenBranch?.projectId === project.id ? chosenBranch.name : undefined
  const current = AsyncResult.isSuccess(branches)
    ? branches.value.find((branch) => branch.isCurrent && !branch.isRemote)?.name
    : undefined
  const shownBranch = chosen ?? current ?? project.defaultBranch

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const prompt = text.trim()
    if (prompt === "" || pending || files.reading) return
    setPending(true)
    setError(undefined)
    if (extra.length > 0) {
      const group = await createGroup({
        payload: {
          projectId: project.id,
          ...(chosen === undefined ? {} : { baseBranch: chosen }),
          prompt,
          ...draft.extras,
          autonomy,
          runs: [...compareRuns({ provider, model }, extra, effort)],
        },
        reactivityKeys: [keys.sessions(project.id), keys.git(project.id)],
      })
      setPending(false)
      if (Exit.isFailure(group)) {
        setError(describeCause(group.cause))
        return
      }
      draft.sent()
      setExtra([])
      const [first] = group.value
      if (first !== undefined) {
        void navigate({
          to: "/projects/$projectId/sessions/$sessionId",
          params: { projectId: project.id, sessionId: first.id },
        })
        if (first.groupId != null) openCompare(first.groupId)
      }
      return
    }
    const exit = await create({
      payload: {
        projectId: project.id,
        ...(chosen === undefined ? {} : { baseBranch: chosen }),
        prompt,
        ...draft.extras,
        autonomy,
        provider,
        ...(model === null ? {} : { model }),
        ...(effort === null ? {} : { effort }),
      },
      reactivityKeys: [keys.sessions(project.id), keys.git(project.id)],
    })
    setPending(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    draft.sent()
    void navigate({
      to: "/projects/$projectId/sessions/$sessionId",
      params: { projectId: project.id, sessionId: exit.value.id },
    })
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-2xl flex-col gap-3">
      {files.error !== undefined && (
        <ErrorNote title="Some files were not attached" message={files.error} />
      )}
      <PromptBox
        draft={draft}
        disabled={pending}
        onSubmit={() => void submit()}
        placeholder="Ask anything. @ files."
        label="First message to the agent"
        autoFocus
        className="max-h-72 min-h-20"
        footer={
          <>
            <AddMenu
              projectId={project.id}
              onFiles={(picked) => void files.add(picked)}
              onInsert={insert}
              disabled={pending}
            />
            <BranchPicker
              project={project}
              value={shownBranch}
              onChange={(name) => setChosenBranch({ projectId: project.id, name })}
              disabled={pending}
            />
            <AutonomyPicker
              value={autonomy}
              projectId={project.id}
              onChange={setAutonomy}
              disabled={pending}
            />
            <div className="ml-auto flex items-center gap-1">
              <ModelPicker
                provider={provider}
                value={model}
                onChange={setModel}
                effort={effort}
                onEffortChange={setEffort}
                disabled={pending}
                compare={{ others: extra, max: COMPARE_RUNS.max, onOthersChange: setExtra }}
              />
              <SendButton
                ready={text.trim() !== "" && !pending && !files.reading}
                disabled={pending || files.reading || text.trim() === ""}
                label={
                  pending
                    ? "Creating the session"
                    : extra.length > 0
                      ? `Start ${extra.length + 1} runs to compare`
                      : "Start the session"
                }
              />
            </div>
          </>
        }
      />
      {!pending && <KeyHint typing={text.trim() !== ""} className="flex justify-center" />}
      {pending && (
        <p className="text-center text-xs text-muted-foreground" aria-live="polite">
          {extra.length > 0
            ? `Starting ${extra.length + 1} runs, each in a worktree of its own…`
            : chosen === undefined || chosen === current
              ? "Starting the session…"
              : `Switching your checkout to ${chosen}…`}
        </p>
      )}
      {error !== undefined && <ErrorNote title="Could not start the session" message={error} />}
    </form>
  )
}
