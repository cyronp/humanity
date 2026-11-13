import { useAtom, useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  GITLAB_DEFAULT_HOST,
  type GitHubRepo,
  type GitLabRepo,
  type Project,
} from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { Cause, Exit } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import {
  ArrowLeft,
  BookMarked,
  Download,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  Lock,
} from "lucide-react"
import { useEffect, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  cloneAtom,
  type CloneTarget,
  cloneTargetName,
  githubConnectionAtom,
  reposAtom,
} from "@/features/github/atoms"
import { isConnected } from "@/features/github/connection"
import {
  addableGitLabRepos,
  addableRepos,
  repoNeedle,
  typedChoice,
} from "@/features/github/repoInput"
import { gitlabConnectionAtom, gitlabReposAtom } from "@/features/gitlab/atoms"
import { isGitLabConnected } from "@/features/gitlab/connection"
import { openSettings } from "@/features/settings/settings"
import { formatTimeAgo, useNow } from "@/lib/elapsed"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { closeAddRepository, useAddRepositoryOpen } from "./addRepository.ts"
import { addLocalProjectAtom, projectsAtom } from "./atoms.ts"

/**
 * Adds a repository as a project: a searchable palette at the top of the
 * page, like the branch picker, listing the repositories of the connected
 * GitHub and GitLab accounts. Typing `owner/repo`, a GitHub or GitLab URL or a
 * folder path offers that repository too.
 */
export function AddRepositoryDialog() {
  const open = useAddRepositoryOpen()
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeAddRepository()
      }}
      title="Add a repository"
      description="Search your GitHub and GitLab repositories for one to add as a project"
      className="top-3 sm:max-w-xl"
    >
      <AddRepository />
    </CommandDialog>
  )
}

/** What is being added right now, in the words shown while it runs. */
type Job =
  | { readonly kind: "clone"; readonly target: CloneTarget }
  | { readonly kind: "local"; readonly path: string }

/** Lives only while the palette is open, so every opening starts from the list. */
function AddRepository() {
  const [job, setJob] = useState<Job>()
  const [localError, setLocalError] = useState<string>()
  const [clone, startClone] = useAtom(cloneAtom)
  const addLocal = useAtomSet(addLocalProjectAtom, { mode: "promiseExit" })
  const refreshProjects = useAtomRefresh(projectsAtom)
  const navigate = useNavigate()

  // A clone belongs to one opening: forget the last one, and stop one still running on close.
  useEffect(() => {
    startClone(Atom.Reset)
    return () => startClone(Atom.Interrupt)
  }, [startClone])

  /** The new project's first thread is one click away: open the new chat in it. */
  const open = (project: Project) => {
    closeAddRepository()
    void navigate({ to: "/", search: { project: project.id } })
  }

  const cloned =
    job?.kind === "clone" && AsyncResult.isSuccess(clone) ? clone.value.project : undefined
  useEffect(() => {
    if (cloned === undefined) return
    refreshProjects()
    closeAddRepository()
    void navigate({ to: "/", search: { project: cloned.id } })
  }, [cloned, navigate, refreshProjects])

  const startCloning = (target: CloneTarget) => {
    setJob({ kind: "clone", target })
    startClone(target)
  }

  const addFolder = async (path: string) => {
    setJob({ kind: "local", path })
    const exit = await addLocal({ payload: { path }, reactivityKeys: [keys.projects] })
    if (Exit.isSuccess(exit)) open(exit.value)
    else setLocalError(describeCause(exit.cause))
  }

  if (job === undefined) {
    return <RepositoryList onClone={startCloning} onAddFolder={addFolder} onOpen={open} />
  }

  const cloneError =
    job.kind === "clone" && AsyncResult.isFailure(clone) && !Cause.hasInterruptsOnly(clone.cause)
      ? describeCause(clone.cause)
      : undefined
  const error = job.kind === "clone" ? cloneError : localError
  const lines = AsyncResult.isSuccess(clone) ? clone.value.lines : []

  return (
    <div className="flex flex-col gap-3 p-4" aria-live="polite">
      <span className="text-sm font-medium">
        {job.kind === "clone" ? `Cloning ${cloneTargetName(job.target)}…` : `Adding ${job.path}…`}
      </span>
      {job.kind === "clone" && error === undefined && (
        <>
          <ScrollArea
            orientation="both"
            className="rounded-md border bg-muted/40"
            viewportClassName="max-h-40"
          >
            <pre className="p-2 font-mono text-xs">
              {lines.slice(-12).join("\n") || "Starting git…"}
            </pre>
          </ScrollArea>
          <p className="text-xs text-muted-foreground">Closing this cancels the clone.</p>
        </>
      )}
      {error !== undefined && (
        <>
          <ErrorNote
            title={job.kind === "clone" ? "The clone failed" : "Could not add the folder"}
            message={error}
          />
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              startClone(Atom.Reset)
              setLocalError(undefined)
              setJob(undefined)
            }}
          >
            <ArrowLeft />
            Back to the list
          </Button>
        </>
      )}
    </div>
  )
}

function RepositoryList({
  onClone,
  onAddFolder,
  onOpen,
}: {
  readonly onClone: (target: CloneTarget) => void
  readonly onAddFolder: (path: string) => void
  readonly onOpen: (project: Project) => void
}) {
  const [search, setSearch] = useState("")
  const connection = useAtomValue(githubConnectionAtom)
  const gitlabConnection = useAtomValue(gitlabConnectionAtom)
  const projectsResult = useAtomValue(projectsAtom)
  const projects = AsyncResult.isSuccess(projectsResult) ? projectsResult.value : []
  const github = AsyncResult.isSuccess(connection) ? connection.value : undefined
  const gitlab = AsyncResult.isSuccess(gitlabConnection) ? gitlabConnection.value : undefined
  const connected = github !== undefined && isConnected(github)
  const gitlabConnected = gitlab !== undefined && isGitLabConnected(gitlab)
  const [repos, setRepos] = useState<ReadonlyArray<GitHubRepo>>()
  const [gitlabRepos, setGitlabRepos] = useState<ReadonlyArray<GitLabRepo>>()
  const typed = typedChoice(
    search,
    repos ?? [],
    projects,
    gitlab === undefined ? undefined : { host: gitlab.host, repos: gitlabRepos ?? [] },
  )
  const needle = repoNeedle(search, gitlab?.host)
  const accountsPending =
    AsyncResult.isInitial(connection) || AsyncResult.isInitial(gitlabConnection)
  // Until the accounts are known, and then their repositories, the list is still loading.
  const loading =
    accountsPending ||
    (connected && repos === undefined) ||
    (gitlabConnected && gitlabRepos === undefined)
  // What keeps repositories from being listed, when no account lists any.
  const unlisted =
    accountsPending || connected || gitlabConnected
      ? undefined
      : AsyncResult.isFailure(connection)
        ? describeCause(connection.cause)
        : (github?.problem ??
          gitlab?.problem ??
          "Neither GitHub nor GitLab is connected, so your repositories are not listed.")

  return (
    <Command
      // Plain substring search: predictable for names, and a pasted URL finds its repository.
      filter={(value, _search, keywords) =>
        [value, ...(keywords ?? [])].some((text) => text.toLowerCase().includes(needle)) ? 1 : 0
      }
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search your repositories, or paste owner/repo, a URL or a folder path"
      />
      <CommandList className="max-h-96">
        {!loading && (
          <CommandEmpty className="px-6 text-muted-foreground">
            {connected || gitlabConnected
              ? "No repository matches. Paste owner/repo, a GitHub or GitLab URL or the path of a folder on this computer to add another."
              : "Paste owner/repo or a GitHub or GitLab URL to clone a public repository, or the path of a folder on this computer."}
          </CommandEmpty>
        )}
        {typed !== undefined && (
          <CommandGroup heading="From what you typed">
            {typed.kind === "clone" && (
              <CommandItem
                value={typed.fullName}
                onSelect={() => onClone({ provider: "github", fullName: typed.fullName })}
              >
                <Download className="text-muted-foreground" />
                <span className="truncate">
                  Clone <span className="font-medium">{typed.fullName}</span> from GitHub
                </span>
              </CommandItem>
            )}
            {typed.kind === "cloneGitLab" && (
              <CommandItem
                value={typed.fullPath}
                onSelect={() => onClone({ provider: "gitlab", fullPath: typed.fullPath })}
              >
                <Download className="text-muted-foreground" />
                <span className="truncate">
                  Clone <span className="font-medium">{typed.fullPath}</span> from{" "}
                  {gitlab?.host ?? "GitLab"}
                </span>
              </CommandItem>
            )}
            {typed.kind === "local" && (
              <CommandItem value={typed.path} onSelect={() => onAddFolder(typed.path)}>
                <FolderPlus className="text-muted-foreground" />
                <span className="truncate">
                  Add the repository in <span className="font-mono text-xs">{typed.path}</span>
                </span>
              </CommandItem>
            )}
            {typed.kind === "added" && (
              <CommandItem
                value={
                  typed.project.githubFullName ??
                  typed.project.gitlab?.fullPath ??
                  typed.project.name
                }
                onSelect={() => onOpen(typed.project)}
              >
                <FolderOpen className="text-muted-foreground" />
                <span className="truncate">
                  <span className="font-medium">{typed.project.name}</span> is already added. Open
                  it
                </span>
              </CommandItem>
            )}
          </CommandGroup>
        )}
        {connected && (
          <>
            {typed !== undefined && <CommandSeparator />}
            <GitHubRepos
              login={github?.user?.login ?? ""}
              projects={projects}
              onLoaded={setRepos}
              onClone={onClone}
            />
          </>
        )}
        {gitlab !== undefined && gitlabConnected && (
          <>
            {(typed !== undefined || connected) && <CommandSeparator />}
            <GitLabRepos
              host={gitlab.host}
              username={gitlab.user?.username ?? ""}
              projects={projects}
              onLoaded={setGitlabRepos}
              onClone={onClone}
            />
          </>
        )}
        {accountsPending && <ListSkeleton />}
      </CommandList>
      {unlisted !== undefined && <ConnectionFooter reason={unlisted} />}
    </Command>
  )
}

/** The repositories of the connected account that are not projects yet, newest activity first. */
function GitHubRepos({
  login,
  projects,
  onLoaded,
  onClone,
}: {
  readonly login: string
  readonly projects: ReadonlyArray<Project>
  /** Hands the whole list up, so typed text is only offered when the list lacks it. */
  readonly onLoaded: (repos: ReadonlyArray<GitHubRepo>) => void
  readonly onClone: (target: CloneTarget) => void
}) {
  const repos = useAtomValue(reposAtom)
  const now = useNow(60_000)
  const loaded = AsyncResult.isSuccess(repos) ? repos.value : undefined
  useEffect(() => {
    if (loaded !== undefined) onLoaded(loaded)
  }, [loaded, onLoaded])

  if (AsyncResult.isFailure(repos)) {
    return (
      <p className="px-3 py-6 text-center text-sm text-destructive">{describeCause(repos.cause)}</p>
    )
  }
  if (loaded === undefined) return <ListSkeleton />

  const addable = addableRepos(loaded, projects)
  if (addable.length === 0) return null
  return (
    <CommandGroup heading={`GitHub · ${login}`}>
      {addable.map((repo) => (
        <RepoRow
          key={repo.fullName}
          name={repo.fullName}
          repo={repo}
          now={now}
          onSelect={() => onClone({ provider: "github", fullName: repo.fullName })}
        />
      ))}
    </CommandGroup>
  )
}

/** The same for the connected GitLab instance. */
function GitLabRepos({
  host,
  username,
  projects,
  onLoaded,
  onClone,
}: {
  readonly host: string
  readonly username: string
  readonly projects: ReadonlyArray<Project>
  readonly onLoaded: (repos: ReadonlyArray<GitLabRepo>) => void
  readonly onClone: (target: CloneTarget) => void
}) {
  const repos = useAtomValue(gitlabReposAtom)
  const now = useNow(60_000)
  const loaded = AsyncResult.isSuccess(repos) ? repos.value : undefined
  useEffect(() => {
    if (loaded !== undefined) onLoaded(loaded)
  }, [loaded, onLoaded])

  if (AsyncResult.isFailure(repos)) {
    return (
      <p className="px-3 py-6 text-center text-sm text-destructive">{describeCause(repos.cause)}</p>
    )
  }
  if (loaded === undefined) return <ListSkeleton />

  const addable = addableGitLabRepos(loaded, projects, host)
  if (addable.length === 0) return null
  return (
    <CommandGroup heading={`${host === GITLAB_DEFAULT_HOST ? "GitLab" : host} · ${username}`}>
      {addable.map((repo) => (
        <RepoRow
          key={repo.fullPath}
          name={repo.fullPath}
          repo={repo}
          now={now}
          onSelect={() => onClone({ provider: "gitlab", fullPath: repo.fullPath })}
        />
      ))}
    </CommandGroup>
  )
}

/** Two lines, like a branch: the repository and when it last changed, then what it is. */
function RepoRow({
  name,
  repo,
  now,
  onSelect,
}: {
  /** The repository as its host writes it: `owner/repo` or `group/subgroup/name`. */
  readonly name: string
  readonly repo: Pick<GitHubRepo, "description" | "private" | "updatedAt">
  readonly now: number
  readonly onSelect: () => void
}) {
  const Icon = repo.private ? Lock : BookMarked
  const ago = formatTimeAgo(repo.updatedAt, now)
  return (
    <CommandItem
      value={name}
      keywords={repo.description === null ? [] : [repo.description]}
      onSelect={onSelect}
      className="items-start"
    >
      <Icon className="mt-0.5 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{name}</span>
          {repo.private && <span className="shrink-0 text-xs text-muted-foreground">private</span>}
          {ago !== "" && (
            <span className="shrink-0 text-xs text-muted-foreground">
              <span aria-hidden>• </span>
              <time dateTime={repo.updatedAt}>{ago}</time>
            </span>
          )}
        </span>
        {repo.description !== null && (
          <span className="truncate text-xs text-muted-foreground">{repo.description}</span>
        )}
      </span>
    </CommandItem>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2" aria-label="Loading repositories">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-10 w-full" />
      ))}
    </div>
  )
}

function ConnectionFooter({ reason }: { readonly reason: string }) {
  return (
    <div className="-mx-1 mt-1 -mb-1 flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
      <FolderGit2 className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{reason}</span>
      <Button
        variant="outline"
        size="xs"
        onClick={() => {
          closeAddRepository()
          openSettings("repositories")
        }}
      >
        Connect an account
      </Button>
    </div>
  )
}
