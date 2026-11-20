import { useAtomValue } from "@effect/atom-react"
import type {
  BranchPublication,
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
  GitBranch,
  LoaderCircle,
} from "lucide-react"
import { AsyncView } from "@/components/AsyncView"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Markdown } from "@/features/chat/Markdown"
import { feedKey, publicationAtom, pullRequestFeedAtom } from "../atoms.ts"
import { CheckoutMovedNote } from "./CheckoutMovedNote.tsx"
import { FeedNote } from "./FeedNote.tsx"
import { checkoutMoved, forgeTerms, remoteStatus, summarizeChecks } from "./publication.ts"
import { PullRequestHeading } from "./PullRequestHeading.tsx"

const CHECK_ICON: Record<
  CheckStatus,
  { readonly Icon: typeof CircleCheck; readonly className: string }
> = {
  success: { Icon: CircleCheck, className: "text-success" },
  failure: { Icon: CircleX, className: "text-destructive" },
  running: { Icon: LoaderCircle, className: "animate-spin text-warning" },
  queued: { Icon: CircleDashed, className: "text-warning" },
  cancelled: { Icon: CircleSlash, className: "text-muted-foreground" },
  skipped: { Icon: CircleMinus, className: "text-muted-foreground" },
  neutral: { Icon: CircleMinus, className: "text-muted-foreground" },
}

export function OverviewTab({ session }: { readonly session: Session }) {
  const publication = useAtomValue(publicationAtom(session.id))
  return (
    <AsyncView result={publication} errorTitle="Could not read the branch">
      {(value) =>
        checkoutMoved(value) ? (
          <CheckoutMovedNote session={session} publication={value} />
        ) : (
          <div className="flex flex-col gap-4">
            <BranchSummary publication={value} />
            {value.forge === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Pull requests need an origin on GitHub or a connected GitLab.
              </p>
            ) : (
              <Followed session={session} publication={value} forge={value.forge} />
            )}
          </div>
        )
      }
    </AsyncView>
  )
}

function BranchSummary({ publication }: { readonly publication: BranchPublication }) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-card px-3 py-2">
      <GitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <code className="truncate font-mono text-sm" title={publication.branch ?? undefined}>
          {publication.branch ?? "detached HEAD"}
        </code>
        <p className="text-xs text-muted-foreground">{remoteStatus(publication)}</p>
      </div>
    </div>
  )
}

function Followed({
  session,
  publication,
  forge,
}: {
  readonly session: Session
  readonly publication: BranchPublication
  readonly forge: Forge
}) {
  const { branch } = publication
  const feed = useAtomValue(pullRequestFeedAtom(feedKey(session.id, branch)))
  const terms = forgeTerms(forge)
  return (
    <AsyncView result={feed} errorTitle={`Could not load the ${terms.noun}`}>
      {(value) => (
        <div className="flex flex-col gap-4">
          <FeedNote feed={value} forge={forge} />
          {value.pullRequest !== null ? (
            <PullRequestView pullRequest={value.pullRequest} feed={value} />
          ) : (
            branch !== null &&
            value.fetchedAt !== null && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {branch === publication.defaultBranch ? (
                  <>
                    This thread works on <code>{branch}</code>, the default branch. Set up a
                    worktree to open a {terms.noun}.
                  </>
                ) : (
                  <>
                    <code>{branch}</code> has no {terms.noun} yet.
                  </>
                )}
              </p>
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
