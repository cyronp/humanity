import type { PullRequest, PullRequestState } from "@humanity/contracts"
import { cn } from "cn"
import {
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { forgeTerms } from "./publication.ts"

/**
 * Each state in the colour git already has for it here: added, deleted and
 * merged follow the theme, so the pill reads the same in light and dark.
 */
const STATE: Record<
  PullRequestState,
  { readonly label: string; readonly Icon: typeof GitMerge; readonly className: string }
> = {
  open: { label: "Open", Icon: GitPullRequest, className: "bg-git-added text-background" },
  draft: {
    label: "Draft",
    Icon: GitPullRequestDraft,
    className: "bg-git-draft text-background",
  },
  merged: { label: "Merged", Icon: GitMerge, className: "bg-git-merged text-background" },
  closed: {
    label: "Closed",
    Icon: GitPullRequestClosed,
    className: "bg-git-deleted text-background",
  },
}

/** A pull request's state as a pill: its icon and its name, in its colour. */
export function PullRequestStateBadge({ state }: { readonly state: PullRequestState }) {
  const { label, Icon, className } = STATE[state]
  return (
    <Badge className={cn("shrink-0 font-semibold", className)}>
      <Icon strokeWidth={2.5} />
      {label}
    </Badge>
  )
}

/** A pull request's state, title and number, linked to its page, and the branches it joins. */
export function PullRequestHeading({ pullRequest }: { readonly pullRequest: PullRequest }) {
  const terms = forgeTerms(pullRequest.forge)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <PullRequestStateBadge state={pullRequest.state} />
        <a
          href={pullRequest.url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 text-sm font-medium hover:underline"
          title={`Open this ${terms.noun} on ${terms.site}`}
        >
          {pullRequest.title}{" "}
          <span className="font-normal text-muted-foreground">
            {terms.symbol}
            {pullRequest.number}
          </span>
          <ExternalLink className="ml-1 inline size-3 text-muted-foreground" />
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        <code>{pullRequest.head}</code> into <code>{pullRequest.base}</code> · by{" "}
        {pullRequest.author}
      </p>
    </div>
  )
}
