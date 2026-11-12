import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Autonomy, Project, ProjectId, ReasoningEffort, Session } from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { FolderPlus } from "lucide-react"
import { type FormEvent, type KeyboardEvent, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { InputGroupTextarea } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AttachButton,
  AttachmentTray,
  dropTargetClass,
  useAttachmentDraft,
} from "@/features/chat/attachments"
import { ChatBox, ChatBoxFooter, SendButton } from "@/features/chat/ChatBox"
import { claudeStatusAtom } from "@/features/claude/atoms"
import { branchesAtom } from "@/features/git/atoms"
import { BranchPicker } from "@/features/git/BranchPicker"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { AutonomyPicker } from "@/features/policy/AutonomyPicker"
import { openAddRepository } from "@/features/projects/addRepository"
import { projectsAtom } from "@/features/projects/atoms"
import { ModelPicker } from "@/features/providers/ModelPicker"
import { ReasoningPicker } from "@/features/providers/ReasoningPicker"
import { allSessionsAtom, createSessionAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { usePinnedDefaults } from "./pinnedDefaults.ts"
import { type ThreadDefaults, threadDefaults } from "./threadDefaults.ts"

/**
 * The home page: one message box, like any AI chat. It starts a new session
 * in the repository the human prompted last, with that thread's model,
 * reasoning effort and autonomy (or the pinned effort and autonomy), unless
 * they pick otherwise.
 */
export function NewChat({
  projectId,
}: {
  /** The project chosen in the URL (from the header's switcher); the last prompted one otherwise. */
  readonly projectId: ProjectId | undefined
}) {
  const projects = useAtomValue(projectsAtom)
  const sessions = useAtomValue(allSessionsAtom)
  const status = useAtomValue(claudeStatusAtom)
  const list = AsyncResult.isSuccess(projects) ? projects.value : []
  const recent = AsyncResult.isSuccess(sessions) ? sessions.value : []
  const lastProjectId = lastPrompted(recent)
  const { pinned } = usePinnedDefaults()
  const defaults = threadDefaults(
    recent,
    AsyncResult.isSuccess(status) ? status.value.models : undefined,
    pinned,
  )
  // Until the human picks one, follow the last prompted project as it loads.
  const project =
    list.find((candidate) => candidate.id === projectId) ??
    list.find((candidate) => candidate.id === lastProjectId) ??
    list[0]

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pt-14 pb-10">
      <AppHeader>
        <ProjectBreadcrumb project={project} />
      </AppHeader>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">What should we work on?</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The agent works in your checkout; set up a worktree from the session to give it its own
          branch. Every change it proposes waits for your review.
        </p>
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
            <NewChatForm project={project} defaults={defaults} />
          ),
      })}
    </div>
  )
}

/** The project of the most recently active session: where the human was last prompting. */
const lastPrompted = (sessions: ReadonlyArray<Session>): ProjectId | undefined =>
  sessions[0]?.projectId

function NoProjects() {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">
        Add a repository first. Humanity works on one cloned from GitHub or a git repository already
        on this machine.
      </p>
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
}: {
  readonly project: Project
  /** The pinned defaults, else how the last thread was left; each setting follows them until the human picks another. */
  readonly defaults: ThreadDefaults
}) {
  const create = useAtomSet(createSessionAtom, { mode: "promiseExit" })
  const navigate = useNavigate()
  // `undefined` is "not picked yet"; `null` is a picked "Default".
  const [chosenModel, setModel] = useState<string | null>()
  const [chosenEffort, setEffort] = useState<ReasoningEffort | null>()
  const [chosenAutonomy, setAutonomy] = useState<Autonomy>()
  const model = chosenModel === undefined ? defaults.model : chosenModel
  const effort = chosenEffort === undefined ? defaults.effort : chosenEffort
  const autonomy = chosenAutonomy ?? defaults.autonomy
  const [chosenBranch, setChosenBranch] = useState<{ projectId: ProjectId; name: string }>()
  const [text, setText] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const files = useAttachmentDraft()

  const branches = useAtomValue(branchesAtom(project.id))
  const chosen = chosenBranch?.projectId === project.id ? chosenBranch.name : undefined
  // The checkout stays on its branch unless the human picks another one.
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
    const exit = await create({
      payload: {
        projectId: project.id,
        ...(chosen === undefined ? {} : { baseBranch: chosen }),
        prompt,
        ...(files.uploads.length === 0 ? {} : { attachments: files.uploads }),
        autonomy,
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
    setText("")
    files.clear()
    void navigate({
      to: "/projects/$projectId/sessions/$sessionId",
      params: { projectId: project.id, sessionId: exit.value.id },
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-2xl flex-col gap-3">
      {files.error !== undefined && (
        <ErrorNote title="Some files were not attached" message={files.error} />
      )}
      <ChatBox className={dropTargetClass} {...(pending ? {} : files.dropProps)}>
        <AttachmentTray draft={files} />
        <InputGroupTextarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={pending ? undefined : files.onPaste}
          placeholder={`Ask the agent to work on ${project.name}…`}
          disabled={pending}
          rows={3}
          autoFocus
          className="max-h-72 min-h-20 px-4 pt-3.5"
          aria-label="First message to the agent"
        />
        <ChatBoxFooter>
          <AttachButton onFiles={(picked) => void files.add(picked)} disabled={pending} />
          <BranchPicker
            project={project}
            value={shownBranch}
            onChange={(name) => setChosenBranch({ projectId: project.id, name })}
            disabled={pending}
          />
          <AutonomyPicker value={autonomy} onChange={setAutonomy} disabled={pending} />
          <div className="ml-auto flex items-center gap-1">
            <ReasoningPicker value={effort} onChange={setEffort} disabled={pending} />
            <ModelPicker value={model} onChange={setModel} />
            <SendButton
              ready={text.trim() !== "" && !pending && !files.reading}
              disabled={pending || files.reading || text.trim() === ""}
              label={pending ? "Creating the session" : "Start the session"}
            />
          </div>
        </ChatBoxFooter>
      </ChatBox>
      {pending && (
        <p className="text-center text-xs text-muted-foreground" aria-live="polite">
          {chosen === undefined || chosen === current
            ? "Starting the session…"
            : `Switching your checkout to ${chosen}…`}
        </p>
      )}
      {error !== undefined && <ErrorNote title="Could not start the session" message={error} />}
    </form>
  )
}
