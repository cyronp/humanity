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
import { type FormEvent, type KeyboardEvent, useId, useMemo, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AttachmentTray, dropTargetClass, useAttachmentDraft } from "@/features/chat/attachments"
import { AddMenu } from "@/features/chat/AddMenu"
import {
  ChatBox,
  ChatBoxFooter,
  KeyHint,
  noteMessageSent,
  SendButton,
  sendKeyPressed,
} from "@/features/chat/ChatBox"
import { FileMentionMenu, fileMentionIds } from "@/features/chat/FileMentionMenu"
import { MentionTextarea } from "@/features/chat/MentionTextarea"
import { useFileMention } from "@/features/chat/useFileMention"
import { claudeStatusAtom } from "@/features/claude/atoms"
import { compareRuns, openCompare } from "@/features/compare/compare"
import { codexStatusAtom } from "@/features/codex/atoms"
import { branchesAtom, searchProjectFilesAtom } from "@/features/git/atoms"
import { BranchPicker } from "@/features/git/BranchPicker"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { WorkspaceFrame } from "@/features/layout/WorkspaceFrame"
import { usePromptInsert } from "@/features/extensions/usePromptInsert"
import { AutonomyPicker } from "@/features/policy/AutonomyPicker"
import { openAddRepository } from "@/features/projects/addRepository"
import { projectsAtom } from "@/features/projects/atoms"
import { ModelPicker } from "@/features/providers/ModelPicker"
import type { ModelChoice } from "@/features/providers/models"
import { allSessionsAtom, createGroupAtom, createSessionAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
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
  const claude = useAtomValue(claudeStatusAtom)
  const codex = useAtomValue(codexStatusAtom)
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
    {
      ...(AsyncResult.isSuccess(claude) ? { "claude-code": claude.value.models } : {}),
      ...(AsyncResult.isSuccess(codex) ? { codex: codex.value.models } : {}),
    },
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
  const [text, setText] = useState(initialPrompt ?? "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const files = useAttachmentDraft()
  const { textarea, insert } = usePromptInsert(text, setText)
  const searchFiles = useAtomSet(searchProjectFilesAtom, { mode: "promiseExit" })
  const mentions = useFileMention({
    text,
    setText,
    textarea,
    search: (query, recent) => searchFiles({ payload: { projectId: project.id, query, recent } }),
    recentScope: project.id,
    disabled: pending,
  })
  const idBase = useId()
  const mentionIds = fileMentionIds(idBase)

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
          ...(files.uploads.length === 0 ? {} : { attachments: files.uploads }),
          ...(mentions.picked.length === 0 ? {} : { mentions: mentions.picked }),
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
      noteMessageSent()
      setText("")
      setExtra([])
      mentions.sent()
      files.clear()
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
        ...(files.uploads.length === 0 ? {} : { attachments: files.uploads }),
        ...(mentions.picked.length === 0 ? {} : { mentions: mentions.picked }),
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
    noteMessageSent()
    setText("")
    mentions.sent()
    files.clear()
    void navigate({
      to: "/projects/$projectId/sessions/$sessionId",
      params: { projectId: project.id, sessionId: exit.value.id },
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentions.onKeyDown(event)) return
    if (sendKeyPressed(event)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-2xl flex-col gap-3">
      {files.error !== undefined && (
        <ErrorNote title="Some files were not attached" message={files.error} />
      )}
      <ChatBox
        className={dropTargetClass}
        behind={
          mentions.menu !== undefined && <FileMentionMenu menu={mentions.menu} idBase={idBase} />
        }
        {...(pending ? {} : files.dropProps)}
      >
        <AttachmentTray draft={files} />
        <MentionTextarea
          ref={textarea}
          value={text}
          mentions={mentions.picked}
          {...mentions.textareaProps}
          aria-controls={mentions.menu === undefined ? undefined : mentionIds.list}
          aria-activedescendant={
            mentions.menu === undefined || mentions.menu.highlighted < 0
              ? undefined
              : mentionIds.option(mentions.menu.highlighted)
          }
          onKeyDown={onKeyDown}
          onPaste={pending ? undefined : files.onPaste}
          placeholder="Ask anything. @ files."
          disabled={pending}
          rows={3}
          autoFocus
          className="max-h-72 min-h-20"
          aria-label="First message to the agent"
        />
        <ChatBoxFooter>
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
          <AutonomyPicker value={autonomy} onChange={setAutonomy} disabled={pending} />
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
        </ChatBoxFooter>
      </ChatBox>
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
