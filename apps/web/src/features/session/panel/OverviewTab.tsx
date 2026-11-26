import { useAtomValue } from "@effect/atom-react"
import {
  type BranchPublication,
  type Forge,
  type PullRequest,
  type PullRequestComment,
  type PullRequestFeed,
  type Session,
  forgeTerms,
} from "@humanity/contracts"
import { cn } from "cn"
import { ExternalLink } from "lucide-react"
import type { ReactNode } from "react"
import { AsyncView } from "@/components/AsyncView"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Markdown } from "@/features/chat/Markdown"
import { feedKey, publicationAtom, pullRequestFeedAtom } from "../atoms.ts"
import { CheckoutMovedNote } from "./CheckoutMovedNote.tsx"
import { FeedNote } from "./FeedNote.tsx"
import { checkoutMoved, remoteStatus } from "./publication.ts"
import { PullRequestFiles } from "./PullRequestFiles.tsx"
import { PullRequestHeading } from "./PullRequestHeading.tsx"

export function OverviewTab({ session }: { readonly session: Session }) {
  const publication = useAtomValue(publicationAtom(session.id))
  return (
    <AsyncView result={publication} errorTitle="Could not read the branch">
      {(value) =>
        checkoutMoved(value) ? (
          <CheckoutMovedNote session={session} publication={value} />
        ) : value.forge === null ? (
          <Empty>
            Pull requests need an origin on GitHub or a connected GitLab.
            <Standing publication={value} />
          </Empty>
        ) : (
          <Followed session={session} publication={value} forge={value.forge} />
        )
      }
    </AsyncView>
  )
}

function Empty({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function Standing({ publication }: { readonly publication: BranchPublication }) {
  return <p className="text-xs">{remoteStatus(publication)}</p>
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
            <PullRequestView session={session} pullRequest={value.pullRequest} feed={value} />
          ) : (
            branch !== null &&
            value.fetchedAt !== null && (
              <Empty>
                <p>
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
                <Standing publication={publication} />
              </Empty>
            )
          )}
        </div>
      )}
    </AsyncView>
  )
}

function PullRequestView({
  session,
  pullRequest,
  feed,
}: {
  readonly session: Session
  readonly pullRequest: PullRequest
  readonly feed: PullRequestFeed
}) {
  return (
    <div className="flex flex-col gap-5">
      <PullRequestHeading pullRequest={pullRequest} />
      {pullRequest.body.trim() !== "" && (
        <div className="text-sm">
          <Markdown text={pullRequest.body} />
        </div>
      )}
      <PullRequestFiles session={session} pullRequest={pullRequest} />
      <CommentsSection comments={feed.comments} />
    </div>
  )
}

function CommentsSection({ comments }: { readonly comments: ReadonlyArray<PullRequestComment> }) {
  return (
    <section className="flex flex-col" aria-label="Comments">
      <h3 className="flex items-baseline gap-2 text-sm font-medium">
        Comments
        <span className="text-xs font-normal text-muted-foreground">
          {comments.length === 0 ? "No comments yet." : comments.length}
        </span>
      </h3>
      <div className="flex flex-col divide-y">
        {comments.map((comment) => (
          <CommentEntry key={comment.id} comment={comment} />
        ))}
      </div>
    </section>
  )
}

function CommentEntry({ comment }: { readonly comment: PullRequestComment }) {
  const when = comment.createdAt === "" ? null : new Date(comment.createdAt)
  return (
    <article className="flex flex-col gap-2 py-3">
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
