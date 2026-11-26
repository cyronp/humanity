import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { type GitHubRepo, type GitLabRepo, plural } from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Check, ChevronDown, ChevronUp, Download, Lock } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { InlineError } from "@/components/InlineError"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import {
  cloneProjectAtom,
  type CloneTarget,
  githubConnectionAtom,
  reposAtom,
} from "@/features/github/atoms"
import { isConnected } from "@/features/github/connection"
import { GitHubIcon } from "@/features/github/GitHubIcon"
import { addableGitLabRepos, addableRepos } from "@/features/github/repoInput"
import { gitlabConnectionAtom, gitlabReposAtom } from "@/features/gitlab/atoms"
import { isGitLabConnected } from "@/features/gitlab/connection"
import { GitLabIcon } from "@/features/gitlab/GitLabIcon"
import { projectsAtom } from "@/features/projects/atoms"
import { formatTimeAgo, useNow } from "@/lib/elapsed"
import { describeCause } from "@/lib/errors"

interface Option {
  readonly key: string
  readonly name: string
  readonly private: boolean
  readonly updatedAt: string
  readonly target: CloneTarget
}

interface Progress {
  readonly total: number
  readonly done: number
  readonly current: string | undefined
  readonly failures: ReadonlyArray<{ readonly name: string; readonly message: string }>
}

export function RepositoryPicker() {
  const githubResult = useAtomValue(githubConnectionAtom)
  const gitlabResult = useAtomValue(gitlabConnectionAtom)
  const projectsResult = useAtomValue(projectsAtom)
  const refreshProjects = useAtomRefresh(projectsAtom)
  const clone = useAtomSet(cloneProjectAtom, { mode: "promiseExit" })
  const [githubRepos, setGithubRepos] = useState<ReadonlyArray<GitHubRepo>>()
  const [gitlabRepos, setGitlabRepos] = useState<ReadonlyArray<GitLabRepo>>()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [progress, setProgress] = useState<Progress>()
  const now = useNow(60_000)

  const projects = AsyncResult.isSuccess(projectsResult) ? projectsResult.value : []
  const gitlab = AsyncResult.isSuccess(gitlabResult) ? gitlabResult.value : undefined
  const githubConnected = AsyncResult.isSuccess(githubResult) && isConnected(githubResult.value)
  const gitlabConnected = gitlab !== undefined && isGitLabConnected(gitlab)
  const connected = githubConnected || gitlabConnected
  const loading =
    (githubConnected && githubRepos === undefined) || (gitlabConnected && gitlabRepos === undefined)

  const githubOptions: ReadonlyArray<Option> = githubConnected
    ? addableRepos(githubRepos ?? [], projects).map((repo) => ({
        key: `github:${repo.fullName}`,
        name: repo.fullName,
        private: repo.private,
        updatedAt: repo.updatedAt,
        target: { provider: "github", fullName: repo.fullName },
      }))
    : []
  const gitlabOptions: ReadonlyArray<Option> =
    gitlab !== undefined && gitlabConnected
      ? addableGitLabRepos(gitlabRepos ?? [], projects, gitlab.host).map((repo) => ({
          key: `gitlab:${repo.fullPath}`,
          name: repo.fullPath,
          private: repo.private,
          updatedAt: repo.updatedAt,
          target: { provider: "gitlab", fullPath: repo.fullPath },
        }))
      : []
  const chosen = [...githubOptions, ...gitlabOptions].filter((option) => selected.has(option.key))
  const importing = progress?.current !== undefined

  const toggle = (key: string) => {
    const next = new Set(selected)
    if (!next.delete(key)) next.add(key)
    setSelected(next)
  }

  const run = async () => {
    const failures: Array<{ name: string; message: string }> = []
    const total = chosen.length
    for (const [index, option] of chosen.entries()) {
      setProgress({ total, done: index, current: option.name, failures: [...failures] })
      const exit = await clone(option.target)
      if (Exit.isFailure(exit)) {
        failures.push({ name: option.name, message: describeCause(exit.cause) })
      } else {
        refreshProjects()
      }
    }
    setSelected(new Set())
    setProgress({ total, done: total, current: undefined, failures })
  }

  const all = [...githubOptions, ...gitlabOptions]
  const headerId = useId()

  return (
    <div className="flex flex-col gap-3">
      {githubConnected && <GitHubReposLoader onLoaded={setGithubRepos} />}
      {gitlabConnected && <GitLabReposLoader onLoaded={setGitlabRepos} />}
      <div className="flex items-center gap-3">
        <GuideCheckbox
          aria-label="Select all repositories"
          checked={all.length > 0 && chosen.length === all.length}
          indeterminate={chosen.length > 0 && chosen.length < all.length}
          disabled={all.length === 0 || importing}
          onChange={(checked) => setSelected(new Set(checked ? all.map(({ key }) => key) : []))}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span id={headerId} className="text-sm font-medium">
            Import repositories
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {connected
              ? "From your GitHub and GitLab accounts"
              : "Connect an account above to see your repositories"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          disabled={!connected}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide" : "Show"}
          {open ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      {open && connected && (
        <>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex-1 text-muted-foreground">
              {chosen.length} of {all.length} selected
            </span>
            <Button
              variant="link"
              size="xs"
              className="h-auto p-0 text-foreground"
              disabled={importing || chosen.length === all.length}
              onClick={() => setSelected(new Set(all.map(({ key }) => key)))}
            >
              Select all
            </Button>
            <Button
              variant="link"
              size="xs"
              className="h-auto p-0 text-muted-foreground"
              disabled={importing || chosen.length === 0}
              onClick={() => setSelected(new Set())}
            >
              Select none
            </Button>
          </div>
          {loading ? (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Spinner />
              Loading repositories…
            </p>
          ) : all.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No repositories left to import.</p>
          ) : (
            <ul aria-labelledby={headerId} className="flex max-h-48 flex-col overflow-y-auto">
              {all.map((option) => (
                <li key={option.key}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md py-1.5 pr-2 hover:bg-muted/50">
                    <GuideCheckbox
                      checked={selected.has(option.key)}
                      disabled={importing}
                      onChange={() => toggle(option.key)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {option.name}
                    </span>
                    {option.private && (
                      <Lock
                        className="size-3 shrink-0 text-muted-foreground"
                        aria-label="Private"
                      />
                    )}
                    {option.target.provider === "github" ? (
                      <GitHubIcon className="size-3.5 text-muted-foreground" />
                    ) : (
                      <GitLabIcon className="size-3.5" />
                    )}
                    <time
                      dateTime={option.updatedAt}
                      className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
                    >
                      {formatTimeAgo(option.updatedAt, now)}
                    </time>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {(chosen.length > 0 || importing) && (
        <Button
          className="self-end"
          onClick={() => void run()}
          disabled={chosen.length === 0 || importing}
        >
          <Download />
          Import {plural(chosen.length, "repository", "repositories")}
        </Button>
      )}
      {progress !== undefined && <ProgressLine progress={progress} />}
    </div>
  )
}

function GuideCheckbox({
  checked,
  indeterminate = false,
  disabled,
  onChange,
  ...props
}: {
  readonly checked: boolean
  readonly indeterminate?: boolean
  readonly disabled: boolean
  readonly onChange: (checked: boolean) => void
  readonly "aria-label"?: string
}) {
  return (
    <Checkbox
      checked={indeterminate ? "indeterminate" : checked}
      disabled={disabled}
      onCheckedChange={(next) => onChange(next === true)}
      className="data-checked:border-brand data-checked:bg-brand data-checked:text-brand-foreground data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand data-[state=indeterminate]:text-brand-foreground dark:data-checked:bg-brand dark:data-[state=indeterminate]:bg-brand"
      {...props}
    />
  )
}

function ProgressLine({ progress }: { readonly progress: Progress }) {
  const imported = progress.done - progress.failures.length
  return (
    <div className="flex flex-col gap-1 text-xs" aria-live="polite">
      {progress.current !== undefined ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Spinner className="size-3.5 shrink-0" />
          <span className="truncate">
            Importing {progress.current}… ({progress.done + 1} of {progress.total})
          </span>
        </span>
      ) : (
        imported > 0 && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Check className="size-3.5 shrink-0 text-success" />
            Imported {plural(imported, "repository", "repositories")}
          </span>
        )
      )}
      {progress.failures.map((failure) => (
        <InlineError key={failure.name}>
          {failure.name}: {failure.message}
        </InlineError>
      ))}
    </div>
  )
}

function GitHubReposLoader({
  onLoaded,
}: {
  readonly onLoaded: (repos: ReadonlyArray<GitHubRepo>) => void
}) {
  const repos = useAtomValue(reposAtom)
  const loaded = AsyncResult.isSuccess(repos) ? repos.value : undefined
  const failed = AsyncResult.isFailure(repos)
  useEffect(() => {
    if (loaded !== undefined) onLoaded(loaded)
    else if (failed) onLoaded([])
  }, [loaded, failed, onLoaded])
  return null
}

function GitLabReposLoader({
  onLoaded,
}: {
  readonly onLoaded: (repos: ReadonlyArray<GitLabRepo>) => void
}) {
  const repos = useAtomValue(gitlabReposAtom)
  const loaded = AsyncResult.isSuccess(repos) ? repos.value : undefined
  const failed = AsyncResult.isFailure(repos)
  useEffect(() => {
    if (loaded !== undefined) onLoaded(loaded)
    else if (failed) onLoaded([])
  }, [loaded, failed, onLoaded])
  return null
}
