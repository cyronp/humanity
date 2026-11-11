import { useAtom, useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { GitHubRepo } from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { Cause } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Download, Lock, RefreshCw } from "lucide-react"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { projectsAtom } from "@/features/projects/atoms"
import { describeCause } from "@/lib/errors"
import { cloneAtom, reposAtom, whoamiAtom } from "./atoms.ts"
import { ScrollArea } from "@/components/ui/scroll-area"

const FULL_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/

/** `https://github.com/acme/widgets(.git)` or `acme/widgets` → `acme/widgets` */
export const parseRepoInput = (input: string): string | undefined => {
  const trimmed = input
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/$/, "")
  const fromUrl = /github\.com[/:]([^/\s]+\/[^/\s]+)$/.exec(trimmed)?.[1]
  const candidate = fromUrl ?? trimmed
  return FULL_NAME.test(candidate) ? candidate : undefined
}

export function CloneFromGitHubCard() {
  const whoami = useAtomValue(whoamiAtom)
  const [clone, startClone] = useAtom(cloneAtom)
  const refreshProjects = useAtomRefresh(projectsAtom)
  const navigate = useNavigate()

  const cloning = AsyncResult.isWaiting(clone)
  const progress = AsyncResult.isSuccess(clone) ? clone.value : undefined
  const clonedProject = progress?.project

  // When the clone lands, show the new project.
  useEffect(() => {
    if (clonedProject === undefined) return
    refreshProjects()
    void navigate({ to: "/projects/$projectId", params: { projectId: clonedProject.id } })
  }, [clonedProject, navigate, refreshProjects])

  const start = (fullName: string) => {
    if (!cloning) startClone(fullName)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clone from GitHub</CardTitle>
        <CardDescription>
          Clones into <code>~/.humanity/repos</code> and adds the clone as a project.
        </CardDescription>
        <CardAction>
          {AsyncResult.isSuccess(whoami) && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <img src={whoami.value.avatarUrl} alt="" className="size-5 rounded-full" />
              {whoami.value.login}
            </span>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {AsyncResult.isFailure(whoami) && (
          <ErrorNote
            title="Your repositories can't be listed"
            message={`${describeCause(whoami.cause)}\nPublic repositories can still be cloned by name below.`}
          />
        )}
        <CloneByName disabled={cloning} onClone={start} />
        {AsyncResult.isSuccess(whoami) && <RepoList disabled={cloning} onClone={start} />}
        {progress !== undefined && clonedProject === undefined && (
          <CloneLog fullName={progress.fullName} lines={progress.lines} />
        )}
        {cloning && progress === undefined && (
          <p className="text-xs text-muted-foreground">Looking up the repository…</p>
        )}
        {AsyncResult.isFailure(clone) && !Cause.hasInterruptsOnly(clone.cause) && (
          <ErrorNote title="The clone failed" message={describeCause(clone.cause)} />
        )}
      </CardContent>
    </Card>
  )
}

function CloneByName({
  disabled,
  onClone,
}: {
  readonly disabled: boolean
  readonly onClone: (fullName: string) => void
}) {
  const [input, setInput] = useState("")
  const fullName = parseRepoInput(input)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (fullName !== undefined) onClone(fullName)
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="owner/repo or https://github.com/owner/repo"
        aria-label="Repository to clone"
        className="font-mono"
        autoComplete="off"
        spellCheck={false}
      />
      <Button type="submit" disabled={disabled || fullName === undefined}>
        <Download />
        Clone
      </Button>
    </form>
  )
}

function RepoList({
  disabled,
  onClone,
}: {
  readonly disabled: boolean
  readonly onClone: (fullName: string) => void
}) {
  const repos = useAtomValue(reposAtom)
  const refresh = useAtomRefresh(reposAtom)
  const [filter, setFilter] = useState("")

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter your repositories"
          aria-label="Filter repositories"
        />
        <Button variant="ghost" size="icon" onClick={refresh} aria-label="Reload repositories">
          <RefreshCw />
        </Button>
      </div>
      <AsyncView result={repos} errorTitle="Could not list your repositories">
        {(list) => (
          <FilteredRepos repos={list} filter={filter} disabled={disabled} onClone={onClone} />
        )}
      </AsyncView>
    </div>
  )
}

function FilteredRepos({
  repos,
  filter,
  disabled,
  onClone,
}: {
  readonly repos: ReadonlyArray<GitHubRepo>
  readonly filter: string
  readonly disabled: boolean
  readonly onClone: (fullName: string) => void
}) {
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return needle === ""
      ? repos
      : repos.filter(
          (repo) =>
            repo.fullName.toLowerCase().includes(needle) ||
            (repo.description ?? "").toLowerCase().includes(needle),
        )
  }, [repos, filter])

  if (visible.length === 0) {
    return <p className="text-xs text-muted-foreground">No repositories match.</p>
  }
  return (
    <ScrollArea className="rounded-md border" viewportClassName="max-h-80">
      <ul className="flex flex-col divide-y">
        {visible.map((repo) => (
          <li key={repo.fullName} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <code className="truncate font-mono">{repo.fullName}</code>
                {repo.private && (
                  <Badge variant="outline">
                    <Lock />
                    private
                  </Badge>
                )}
              </span>
              {repo.description !== null && (
                <span className="truncate text-xs text-muted-foreground">{repo.description}</span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onClone(repo.fullName)}
            >
              <Download />
              Clone
            </Button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}

function CloneLog({
  fullName,
  lines,
}: {
  readonly fullName: string
  readonly lines: ReadonlyArray<string>
}) {
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <span className="text-xs font-medium">Cloning {fullName}…</span>
      <ScrollArea
        orientation="both"
        className="rounded-md border bg-muted/40"
        viewportClassName="max-h-40"
      >
        <pre className="p-2 font-mono text-xs">
          {lines.slice(-12).join("\n") || "Starting git…"}
        </pre>
      </ScrollArea>
    </div>
  )
}
