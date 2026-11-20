import { useAtomSet } from "@effect/atom-react"
import type {
  BranchPublication,
  FileDiff,
  MergeMethod,
  PullRequest,
  PullRequestFeed,
  Session,
} from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import { cn } from "cn"
import { Exit } from "effect"
import {
  ArrowUpFromLine,
  ChevronDown,
  CircleCheck,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { fileNameClass, FileStatusLetter } from "@/features/diff/FileStatus"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { commitAtom, mergePullRequestAtom, pushAtom, setPullRequestDraftAtom } from "../atoms.ts"
import { isBusy } from "../state.ts"
import {
  commitPaths,
  forgeTerms,
  mergeOptions,
  type PrimaryAction as Action,
  summarizeChecks,
} from "./publication.ts"

const SMALL_CHECKBOX = "size-3.5 [&_svg]:size-3"

export const WAIT_FOR_AGENT = "Available when the agent finishes."

export interface PanelError {
  readonly title: string
  readonly message: string
}

export function PrimaryAction({
  action,
  session,
  publication,
  feed,
  onError,
  onOpenPullRequest,
}: {
  readonly action: Action
  readonly session: Session
  readonly publication: BranchPublication
  readonly feed: PullRequestFeed | undefined
  readonly onError: (error: PanelError | undefined) => void
  readonly onOpenPullRequest: () => void
}) {
  const pullRequest = feed?.pullRequest ?? null
  switch (action.kind) {
    case "commit":
      return null
    case "push":
      return <PushAction session={session} onError={onError} />
    case "open-pull-request":
      return publication.forge === null || publication.branch === null ? null : (
        <Hinted hint={isBusy(session.status) ? WAIT_FOR_AGENT : null}>
          <Button size="sm" disabled={isBusy(session.status)} onClick={onOpenPullRequest}>
            <GitPullRequest />
            {publication.forge === "github" ? "Open PR" : "Open MR"}
          </Button>
        </Hinted>
      )
    case "ready":
      return pullRequest === null ? null : (
        <ReadyAction session={session} pullRequest={pullRequest} onError={onError} />
      )
    case "merge":
      return pullRequest === null || feed === undefined ? null : (
        <MergeAction session={session} pullRequest={pullRequest} feed={feed} />
      )
  }
}

export function Hinted({
  hint,
  children,
}: {
  readonly hint: string | null
  readonly children: ReactNode
}) {
  if (hint === null) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-lg">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  )
}

function ActionPopover({
  icon,
  label,
  open,
  onOpenChange,
  hint,
  children,
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly hint: string | null
  readonly children: ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Hinted hint={hint}>
        <PopoverTrigger asChild>
          <Button size="sm" disabled={hint !== null} className="gap-1.5">
            {icon}
            {label}
            <ChevronDown className="opacity-70" />
          </Button>
        </PopoverTrigger>
      </Hinted>
      <PopoverContent side="top" align="end" className="w-80 gap-3">
        {children}
      </PopoverContent>
    </Popover>
  )
}

interface Method<M extends string> {
  readonly method: M
  readonly label: string
  readonly description: string
}

function MethodList<M extends string>({
  options,
  disabled,
  pending,
  onPick,
}: {
  readonly options: ReadonlyArray<Method<M>>
  readonly disabled: boolean
  readonly pending: M | null
  readonly onPick: (method: M) => void
}) {
  return (
    <div className="flex flex-col gap-0.5" role="group" aria-label="Select method">
      <p className="px-1.5 pb-0.5 text-xs text-muted-foreground">Select method</p>
      {options.map((option) => (
        <button
          key={option.method}
          type="button"
          disabled={disabled || pending !== null}
          onClick={() => onPick(option.method)}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm">{option.label}</span>
            <span className="text-xs text-muted-foreground">{option.description}</span>
          </span>
          {pending === option.method && <Spinner className="size-3.5" />}
        </button>
      ))}
    </div>
  )
}

type CommitMethod = "commit" | "commit-push"

export function CommitBar({
  session,
  publication,
  files,
  note,
  more,
}: {
  readonly session: Session
  readonly publication: BranchPublication
  readonly files: ReadonlyArray<FileDiff>
  readonly note: string
  readonly more: ReactNode
}) {
  const commit = useAtomSet(commitAtom, { mode: "promiseExit" })
  const push = useAtomSet(pushAtom, { mode: "promiseExit" })
  const [open, setOpen] = useState(false)
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState<CommitMethod | null>(null)
  const [error, setError] = useState<PanelError>()
  const busy = isBusy(session.status)

  const picked = files.filter((file) => !left.has(file.filePath))
  const everything = picked.length === files.length
  const counts = countChanges(picked.flatMap((file) => file.hunks))
  const branch = publication.branch ?? session.branch
  const canPush =
    publication.branch !== null && (publication.forge !== null || publication.upstream !== null)
  const ready = message.trim() !== "" && picked.length > 0 && !busy

  const toggle = (path: string) =>
    setLeft((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const run = async (method: CommitMethod) => {
    if (!ready || pending !== null) return
    setPending(method)
    setError(undefined)
    const exit = await commit({
      payload: {
        sessionId: session.id,
        message: message.trim(),
        ...(everything ? {} : { paths: commitPaths(picked) }),
      },
      reactivityKeys: [
        keys.sessionDiff(session.id),
        keys.sessionCommits(session.id),
        keys.git(session.projectId),
        keys.publication(session.id),
      ],
    })
    if (Exit.isFailure(exit)) {
      setPending(null)
      setError({ title: "The commit failed", message: describeCause(exit.cause) })
      return
    }
    setMessage("")
    setLeft(new Set())
    if (method === "commit-push") {
      const pushed = await push({
        payload: { sessionId: session.id },
        reactivityKeys: [
          keys.publication(session.id),
          keys.sessionCommits(session.id),
          keys.git(session.projectId),
          keys.sync(session.id),
        ],
      })
      if (Exit.isFailure(pushed)) {
        setPending(null)
        setError({ title: "Committed, but the push failed", message: describeCause(pushed.cause) })
        return
      }
    }
    setPending(null)
    setOpen(false)
  }

  const options: ReadonlyArray<Method<CommitMethod>> = [
    {
      method: "commit",
      label: `Commit ${picked.length} file${picked.length === 1 ? "" : "s"}`,
      description: `To ${branch}`,
    },
    ...(canPush
      ? [
          {
            method: "commit-push" as const,
            label: "Commit and push",
            description: `Then push ${branch} to origin`,
          },
        ]
      : []),
  ]

  return (
    <>
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            void run("commit")
          }
        }}
        placeholder="Commit message"
        aria-label="Commit message"
        rows={1}
        className="max-h-32 min-h-8 resize-none py-1.5"
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {everything ? note : `${picked.length} of ${files.length} files`}
        </span>
        {more}
        <Hinted hint={busy ? WAIT_FOR_AGENT : null}>
          <div className="flex">
            <Button
              size="sm"
              disabled={!ready || pending !== null}
              onClick={() => void run("commit")}
              className="rounded-r-none"
              title="Commit (Ctrl+Enter)"
            >
              {pending === "commit" ? <Spinner className="size-3.5" /> : <GitCommitHorizontal />}
              Commit
            </Button>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  disabled={busy}
                  className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
                  aria-label="Pick files, or commit and push"
                  title="Pick files, or commit and push"
                >
                  <ChevronDown />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-80 gap-3">
                <div className="overflow-hidden rounded-md border">
                  <label className="flex items-center gap-2 border-b bg-muted/50 px-2 py-1 text-xs font-medium">
                    <Checkbox
                      className={SMALL_CHECKBOX}
                      checked={everything ? true : picked.length > 0 ? "indeterminate" : false}
                      onCheckedChange={() =>
                        setLeft(
                          everything ? new Set(files.map((file) => file.filePath)) : new Set(),
                        )
                      }
                    />
                    {picked.length} of {files.length} file{files.length === 1 ? "" : "s"}
                    <span className="ml-auto">
                      <ChangeCount {...counts} />
                    </span>
                  </label>
                  <ul className="max-h-40 divide-y overflow-y-auto scrollbar-thin">
                    {files.map((file) => (
                      <li key={`${file.kind}:${file.filePath}`}>
                        <label className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted/40">
                          <Checkbox
                            className={SMALL_CHECKBOX}
                            checked={!left.has(file.filePath)}
                            onCheckedChange={() => toggle(file.filePath)}
                          />
                          <code
                            className={cn(
                              "min-w-0 flex-1 truncate font-mono",
                              fileNameClass(file.kind),
                            )}
                            title={file.filePath}
                          >
                            {file.filePath}
                          </code>
                          <FileStatusLetter kind={file.kind} />
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                {message.trim() === "" && (
                  <p className="text-xs text-muted-foreground">Write a commit message first.</p>
                )}
                <MethodList
                  options={options}
                  disabled={!ready}
                  pending={pending}
                  onPick={(method) => void run(method)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </Hinted>
      </div>
      {error !== undefined && <ErrorNote title={error.title} message={error.message} />}
    </>
  )
}

function PushAction({
  session,
  onError,
}: {
  readonly session: Session
  readonly onError: (error: PanelError | undefined) => void
}) {
  const push = useAtomSet(pushAtom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)
  const busy = isBusy(session.status)

  const onPush = async () => {
    setPending(true)
    onError(undefined)
    const exit = await push({
      payload: { sessionId: session.id },
      reactivityKeys: [
        keys.publication(session.id),
        keys.sessionCommits(session.id),
        keys.git(session.projectId),
        keys.sync(session.id),
      ],
    })
    setPending(false)
    if (Exit.isFailure(exit))
      onError({ title: "The push failed", message: describeCause(exit.cause) })
  }

  return (
    <Hinted hint={busy ? WAIT_FOR_AGENT : null}>
      <Button size="sm" disabled={busy || pending} onClick={() => void onPush()}>
        {pending ? <Spinner className="size-3.5" /> : <ArrowUpFromLine />}
        {pending ? "Pushing…" : "Push"}
      </Button>
    </Hinted>
  )
}

function ReadyAction({
  session,
  pullRequest,
  onError,
}: {
  readonly session: Session
  readonly pullRequest: PullRequest
  readonly onError: (error: PanelError | undefined) => void
}) {
  const setDraft = useAtomSet(setPullRequestDraftAtom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)
  const terms = forgeTerms(pullRequest.forge)

  const onReady = async () => {
    setPending(true)
    onError(undefined)
    const exit = await setDraft({ payload: { sessionId: session.id, draft: false } })
    setPending(false)
    if (Exit.isFailure(exit)) {
      onError({
        title: `The ${terms.noun} is still a draft`,
        message: describeCause(exit.cause),
      })
    }
  }

  return (
    <Button size="sm" disabled={pending} onClick={() => void onReady()}>
      {pending ? <Spinner className="size-3.5" /> : <CircleCheck />}
      Ready for review
    </Button>
  )
}

function MergeAction({
  session,
  pullRequest,
  feed,
}: {
  readonly session: Session
  readonly pullRequest: PullRequest
  readonly feed: PullRequestFeed
}) {
  const merge = useAtomSet(mergePullRequestAtom, { mode: "promiseExit" })
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState("")
  const [pending, setPending] = useState<MergeMethod | null>(null)
  const [error, setError] = useState<string>()
  const terms = forgeTerms(pullRequest.forge)
  const checks = summarizeChecks(feed.checks)

  const run = async (method: MergeMethod) => {
    if (pending !== null) return
    setPending(method)
    setError(undefined)
    const exit = await merge({
      payload: {
        sessionId: session.id,
        merge: { method, comment, headSha: pullRequest.headSha },
      },
      reactivityKeys: [
        keys.publication(session.id),
        keys.git(session.projectId),
        keys.sync(session.id),
      ],
    })
    setPending(null)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    setComment("")
    setOpen(false)
  }

  return (
    <ActionPopover icon={<GitMerge />} label="Merge" open={open} onOpenChange={setOpen} hint={null}>
      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={3}
        placeholder="Leave a comment (optional)"
        aria-label="Comment"
        autoFocus
      />
      {(checks.overall === "failure" || checks.overall === "pending") && (
        <p
          className={cn(
            "px-1.5 text-xs",
            checks.overall === "failure" ? "text-destructive" : "text-warning",
          )}
        >
          {checks.overall === "failure"
            ? `${checks.failed} check${checks.failed === 1 ? "" : "s"} failing.`
            : `${checks.pending} check${checks.pending === 1 ? "" : "s"} still running.`}
        </p>
      )}
      <MethodList
        options={mergeOptions(pullRequest.forge)}
        disabled={false}
        pending={pending}
        onPick={(method) => void run(method)}
      />
      {error !== undefined && (
        <ErrorNote title={`The ${terms.noun} was not merged`} message={error} />
      )}
    </ActionPopover>
  )
}
