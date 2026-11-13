import { useAtomValue } from "@effect/atom-react"
import type {
  CheckStatus,
  Forge,
  PullRequest,
  PullRequestCheck,
  PullRequestComment,
  PullRequestFeed,
  Session,
} from "@humanity/contracts"
import { cn } from "cn"
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleSlash,
  CircleX,
  ExternalLink,
  GitCommitHorizontal,
  LoaderCircle,
} from "lucide-react"
import { AsyncView } from "@/components/AsyncView"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/features/chat/Markdown"
import { feedKey, publicationAtom, pullRequestFeedAtom } from "../atoms.ts"
import { FeedNote } from "./FeedNote.tsx"
import { forgeTerms, summarizeChecks } from "./publication.ts"
import { PullRequestHeading } from "./PullRequestHeading.tsx"

const CHECK_ICON: Record<
  CheckStatus,
  { readonly Icon: typeof CircleCheck; readonly className: string }
> = {
  success: { Icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  failure: { Icon: CircleX, className: "text-red-600 dark:text-red-400" },
  running: { Icon: LoaderCircle, className: "animate-spin text-amber-600 dark:text-amber-400" },
  queued: { Icon: CircleDashed, className: "text-amber-600 dark:text-amber-400" },
  cancelled: { Icon: CircleSlash, className: "text-muted-foreground" },
  skipped: { Icon: CircleMinus, className: "text-muted-foreground" },
  neutral: { Icon: CircleMinus, className: "text-muted-foreground" },
}

/**
 * The branch's pull request: its CI checks and every comment on it. The
 * daemon follows it and sends what changes, so this tab never asks the forge.
 */
export function PullRequestTab({
  session,
  onOpenCommit,
}: {
  readonly session: Session
  /** Shows the commit tab, where a pull request is opened. */
  readonly onOpenCommit: () => void
}) {
  // Git alone says which host this is and which branch to follow.
  const publication = useAtomValue(publicationAtom(session.id))
  return (
    <AsyncView result={publication} errorTitle="Could not read the branch">
      {(value) =>
        value.forge === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            This project&apos;s origin is not on GitHub or on a connected GitLab instance, so
            Humanity can&apos;t follow its pull requests.
          </p>
        ) : (
          <Followed
            session={session}
            forge={value.forge}
            branch={value.branch}
            onOpenCommit={onOpenCommit}
          />
        )
      }
    </AsyncView>
  )
}

/** What the forge last said of the branch, under a note when it isn't being asked as usual. */
function Followed({
  session,
  forge,
  branch,
  onOpenCommit,
}: {
  readonly session: Session
  readonly forge: Forge
  readonly branch: string | null
  readonly onOpenCommit: () => void
}) {
  const feed = useAtomValue(pullRequestFeedAtom(feedKey(session.id, branch)))
  return (
    <AsyncView result={feed} errorTitle="Could not load the pull request">
      {(value) => (
        <div className="flex flex-col gap-4">
          <FeedNote feed={value} forge={forge} />
          {value.pullRequest !== null ? (
            <PullRequestView pullRequest={value.pullRequest} feed={value} />
          ) : branch === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No branch is checked out.
            </p>
          ) : (
            // Until the forge answered once, nobody knows whether there is one.
            value.fetchedAt !== null && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {branch} has no {forgeTerms(forge).noun} yet.
                </p>
                <Button variant="outline" size="sm" onClick={onOpenCommit}>
                  <GitCommitHorizontal />
                  Commit and open one
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </AsyncView>
  )
}

function PullRequestView({
  pullRequest,
  feed,
}: {
  readonly pullRequest: PullRequest
  readonly feed: PullRequestFeed
}) {
  const { checks, comments } = feed
  return (
    <div className="flex flex-col gap-6">
      <PullRequestHeading pullRequest={pullRequest} />
      {pullRequest.body.trim() !== "" && (
        <div className="rounded-md border bg-card p-3">
          <Markdown text={pullRequest.body} />
        </div>
      )}
      <ChecksSection checks={checks} />
      <CommentsSection comments={comments} />
    </div>
  )
}

function ChecksSection({ checks }: { readonly checks: ReadonlyArray<PullRequestCheck> }) {
  const summary = summarizeChecks(checks)
  const parts = [
    summary.failed > 0 && `${summary.failed} failing`,
    summary.pending > 0 && `${summary.pending} in progress`,
    summary.passed > 0 && `${summary.passed} passed`,
    summary.other > 0 && `${summary.other} skipped or neutral`,
  ].filter((part) => part !== false)

  return (
    <section className="flex flex-col gap-2" aria-label="Checks">
      <h3 className="flex items-baseline gap-2 text-sm font-medium">
        Checks
        <span className="text-xs font-normal text-muted-foreground">
          {checks.length === 0 ? "None reported for the latest commit." : parts.join(" · ")}
        </span>
      </h3>
      {checks.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-md border bg-card">
          {checks.map((check, index) => {
            const { Icon, className } = CHECK_ICON[check.status]
            return (
              <li key={`${check.name}-${index}`} className="flex items-center gap-2 px-3 py-2">
                <Icon className={cn("size-4 shrink-0", className)} aria-label={check.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{check.name}</p>
                  {check.description !== null && check.description !== "" && (
                    <p className="truncate text-xs text-muted-foreground">{check.description}</p>
                  )}
                </div>
                {check.url !== null && (
                  <a
                    href={check.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Open ${check.name}`}
                    title="Open the details"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function CommentsSection({ comments }: { readonly comments: ReadonlyArray<PullRequestComment> }) {
  return (
    <section className="flex flex-col gap-2" aria-label="Comments">
      <h3 className="flex items-baseline gap-2 text-sm font-medium">
        Comments
        <span className="text-xs font-normal text-muted-foreground">
          {comments.length === 0 ? "No comments yet." : comments.length}
        </span>
      </h3>
      {comments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} />
      ))}
    </section>
  )
}

function CommentCard({ comment }: { readonly comment: PullRequestComment }) {
  const when = comment.createdAt === "" ? null : new Date(comment.createdAt)
  return (
    <article className="flex flex-col gap-2 rounded-md border bg-card p-3">
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <Avatar className="size-5">
          {comment.avatarUrl !== null && <AvatarImage src={comment.avatarUrl} alt="" />}
          <AvatarFallback>{comment.author.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="font-medium">{comment.author}</span>
        {comment.kind === "inline" && comment.path !== null && (
          <code className="min-w-0 truncate text-muted-foreground">
            {comment.path}
            {comment.line !== null && `:${comment.line}`}
          </code>
        )}
        {comment.kind === "review" && comment.reviewState !== null && (
          <Badge variant="outline">{comment.reviewState.replaceAll("_", " ")}</Badge>
        )}
        {when !== null && (
          <time dateTime={comment.createdAt} className="ml-auto text-muted-foreground">
            {when.toLocaleString()}
          </time>
        )}
        {comment.url !== null && (
          <a
            href={comment.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "text-muted-foreground hover:text-foreground",
              when === null && "ml-auto",
            )}
            aria-label="Open this comment"
            title="Open this comment"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </header>
      {comment.body.trim() !== "" && <Markdown text={comment.body} />}
    </article>
  )
}
