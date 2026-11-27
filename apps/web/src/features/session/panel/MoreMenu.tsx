import { useAtomSet } from "@effect/atom-react"
import { type PullRequest, type Session, forgeTerms } from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import {
  CircleCheck,
  Copy,
  Ellipsis,
  GitBranchPlus,
  GitPullRequest,
  GitPullRequestDraft,
  MessageSquarePlus,
  RefreshCw,
  X,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GitHubIcon } from "@/features/github/GitHubIcon"
import { GitLabIcon } from "@/features/gitlab/GitLabIcon"
import { describeCause } from "@/lib/errors"
import { setPullRequestDraftAtom, setPullRequestOpenAtom } from "../atoms.ts"
import type { PanelError } from "./PrimaryAction.tsx"
import { useSetupWorktree } from "./useSetupWorktree.ts"

export const pullRequestPrompt = (pullRequest: PullRequest): string => {
  const terms = forgeTerms(pullRequest.forge)
  return `About ${terms.noun} ${terms.symbol}${pullRequest.number}, "${pullRequest.title}" (${pullRequest.url}), from ${pullRequest.head} into ${pullRequest.base}:\n\n`
}

function Labelled({ label, detail }: { readonly label: string; readonly detail?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span>{label}</span>
      {detail !== undefined && (
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      )}
    </span>
  )
}

export function MoreMenu({
  session,
  pullRequest,
  onError,
  onRefresh,
}: {
  readonly session: Session
  readonly pullRequest: PullRequest | null
  readonly onError: (error: PanelError | undefined) => void
  readonly onRefresh: () => void
}) {
  const navigate = useNavigate()
  const setOpen = useAtomSet(setPullRequestOpenAtom, { mode: "promiseExit" })
  const setDraft = useAtomSet(setPullRequestDraftAtom, { mode: "promiseExit" })
  const worktree = useSetupWorktree(session)
  const [pending, setPending] = useState(false)

  const act = async (title: string, run: () => Promise<Exit.Exit<unknown, unknown>>) => {
    setPending(true)
    onError(undefined)
    const exit = await run()
    setPending(false)
    if (Exit.isFailure(exit)) onError({ title, message: describeCause(exit.cause) })
  }

  const items: Array<ReactNode> = []
  if (pullRequest !== null) {
    const terms = forgeTerms(pullRequest.forge)
    const Icon = pullRequest.forge === "github" ? GitHubIcon : GitLabIcon
    const live = pullRequest.state === "open" || pullRequest.state === "draft"
    items.push(
      <DropdownMenuItem key="open" asChild>
        <a href={pullRequest.url} target="_blank" rel="noreferrer">
          <Icon />
          <Labelled
            label={`Open in ${terms.site}`}
            detail={pullRequest.url.replace(/^https?:\/\//, "")}
          />
        </a>
      </DropdownMenuItem>,
      <DropdownMenuItem
        key="copy"
        onSelect={() => void navigator.clipboard?.writeText(pullRequest.url)}
      >
        <Copy />
        Copy link
      </DropdownMenuItem>,
      <DropdownMenuItem
        key="thread"
        onSelect={() =>
          void navigate({
            to: "/",
            search: { project: session.projectId, prompt: pullRequestPrompt(pullRequest) },
          })
        }
      >
        <MessageSquarePlus />
        New thread with {pullRequest.forge === "github" ? "PR" : "MR"}
      </DropdownMenuItem>,
    )
    if (live || pullRequest.state === "closed") {
      items.push(<DropdownMenuSeparator key="state-separator" />)
    }
    if (pullRequest.state === "open") {
      items.push(
        <DropdownMenuItem
          key="draft"
          disabled={pending}
          onSelect={() =>
            void act(`The ${terms.noun} is still open for review`, () =>
              setDraft({ payload: { sessionId: session.id, draft: true } }),
            )
          }
        >
          <GitPullRequestDraft />
          Convert to draft
        </DropdownMenuItem>,
      )
    }
    if (pullRequest.state === "draft") {
      items.push(
        <DropdownMenuItem
          key="ready"
          disabled={pending}
          onSelect={() =>
            void act(`The ${terms.noun} is still a draft`, () =>
              setDraft({ payload: { sessionId: session.id, draft: false } }),
            )
          }
        >
          <CircleCheck />
          Ready for review
        </DropdownMenuItem>,
      )
    }
    if (live) {
      items.push(
        <DropdownMenuItem
          key="close"
          variant="destructive"
          disabled={pending}
          onSelect={() =>
            void act(`The ${terms.noun} is still open`, () =>
              setOpen({ payload: { sessionId: session.id, open: false } }),
            )
          }
        >
          <X />
          Close {terms.noun}
        </DropdownMenuItem>,
      )
    }
    if (pullRequest.state === "closed") {
      items.push(
        <DropdownMenuItem
          key="reopen"
          disabled={pending}
          onSelect={() =>
            void act(`The ${terms.noun} is still closed`, () =>
              setOpen({ payload: { sessionId: session.id, open: true } }),
            )
          }
        >
          <GitPullRequest />
          Reopen {terms.noun}
        </DropdownMenuItem>,
      )
    }
  }
  if (worktree.available) {
    if (items.length > 0) items.push(<DropdownMenuSeparator key="worktree-separator" />)
    items.push(
      <DropdownMenuItem
        key="worktree"
        disabled={worktree.busy || worktree.pending}
        onSelect={() => {
          onError(undefined)
          void worktree.run().then((failure) => {
            if (failure !== undefined) {
              onError({ title: "The worktree was not set up", message: failure })
            }
          })
        }}
      >
        <GitBranchPlus />
        <Labelled
          label={worktree.pending ? "Setting up worktree…" : "Set up worktree"}
          detail={
            worktree.busy
              ? "Available when the agent finishes"
              : `Move off ${session.branch} onto a branch of its own`
          }
        />
      </DropdownMenuItem>,
    )
  }

  if (items.length > 0) items.push(<DropdownMenuSeparator key="refresh-separator" />)
  items.push(
    <DropdownMenuItem key="refresh" onSelect={onRefresh}>
      <RefreshCw />
      Refresh
    </DropdownMenuItem>,
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="More actions" title="More actions">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
