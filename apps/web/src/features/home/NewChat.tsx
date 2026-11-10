import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Project, ProjectId, Session } from "@humanity/contracts"
import { Link, useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { FolderPlus, GitBranch } from "lucide-react"
import { type FormEvent, type KeyboardEvent, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { ChatBox, ChatBoxFooter, SendButton } from "@/features/chat/ChatBox"
import { branchesAtom } from "@/features/git/atoms"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { projectsAtom } from "@/features/projects/atoms"
import { ModelPicker } from "@/features/providers/ModelPicker"
import { allSessionsAtom, createSessionAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"

/**
 * The home page: one message box, like any AI chat. It starts a new session
 * in the repository the human prompted last, unless they pick another one.
 */
export function NewChat({
  projectId,
}: {
  /** The project chosen in the URL (from the header's switcher); the last prompted one otherwise. */
  readonly projectId: ProjectId | undefined
}) {
  const projects = useAtomValue(projectsAtom)
  const sessions = useAtomValue(allSessionsAtom)
  const list = AsyncResult.isSuccess(projects) ? projects.value : []
  const lastProjectId = AsyncResult.isSuccess(sessions) ? lastPrompted(sessions.value) : undefined
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
          The agent works on its own branch and worktree. Every change it proposes waits for your
          review.
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
          project === undefined ? <NoProjects /> : <NewChatForm project={project} />,
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
        Add a repository first. Humanity works on a git repository on this machine or one cloned
        from GitHub.
      </p>
      <Button asChild>
        <Link to="/projects">
          <FolderPlus />
          Add a project
        </Link>
      </Button>
    </div>
  )
}

function NewChatForm({ project }: { readonly project: Project }) {
  const create = useAtomSet(createSessionAtom, { mode: "promiseExit" })
  const navigate = useNavigate()
  const [model, setModel] = useState<string | null>(null)
  const [chosenBranch, setChosenBranch] = useState<{ projectId: ProjectId; name: string }>()
  const [text, setText] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const baseBranch =
    chosenBranch?.projectId === project.id ? chosenBranch.name : project.defaultBranch

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const prompt = text.trim()
    if (prompt === "" || pending) return
    setPending(true)
    setError(undefined)
    const exit = await create({
      payload: { projectId: project.id, baseBranch, prompt, ...(model === null ? {} : { model }) },
      reactivityKeys: [keys.sessions(project.id), keys.git(project.id)],
    })
    setPending(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    setText("")
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
      <ChatBox>
        <InputGroupTextarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Ask the agent to work on ${project.name}…`}
          disabled={pending}
          rows={3}
          autoFocus
          className="max-h-72 min-h-20 px-4 pt-3.5"
          aria-label="First message to the agent"
        />
        <ChatBoxFooter>
          <BranchPicker
            project={project}
            value={baseBranch}
            onChange={(name) => setChosenBranch({ projectId: project.id, name })}
          />
          <div className="ml-auto flex items-center gap-1">
            <ModelPicker value={model} onChange={setModel} />
            <SendButton
              ready={text.trim() !== "" && !pending}
              disabled={pending || text.trim() === ""}
              label={pending ? "Creating the session" : "Start the session"}
            />
          </div>
        </ChatBoxFooter>
      </ChatBox>
      {pending && (
        <p className="text-center text-xs text-muted-foreground" aria-live="polite">
          Creating a branch and worktree for this session…
        </p>
      )}
      {error !== undefined && <ErrorNote title="Could not start the session" message={error} />}
    </form>
  )
}

/** Picks the branch the new thread's branch and worktree start from. */
function BranchPicker({
  project,
  value,
  onChange,
}: {
  readonly project: Project
  readonly value: string
  readonly onChange: (name: string) => void
}) {
  const branches = useAtomValue(branchesAtom(project.id))
  const names = AsyncResult.isSuccess(branches) ? branches.value.map((branch) => branch.name) : []
  const options = names.includes(value) ? names : [value, ...names]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <InputGroupButton
          size="sm"
          className="max-w-52 text-muted-foreground hover:text-foreground"
          aria-label={`Start from branch ${value}`}
        >
          <GitBranch />
          <span className="truncate font-mono text-xs">{value}</span>
        </InputGroupButton>
      </DropdownMenuTrigger>
      {/* Repositories can have many branches; the list scrolls instead of growing past the screen. */}
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Start from</DropdownMenuLabel>
            {options.map((name) => (
              <DropdownMenuRadioItem key={name} value={name} className="font-mono text-xs">
                {name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
