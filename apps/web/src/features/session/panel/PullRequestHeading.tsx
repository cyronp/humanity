import type { PullRequest, PullRequestState } from "@humanity/contracts"
import { cn } from "cn"
import { ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { forgeTerms } from "./publication.ts"

const STATE: Record<PullRequestState, { readonly label: string; readonly className: string }> = {
  open: { label: "Open", className: "bg-emerald-600 text-white" },
  draft: { label: "Draft", className: "bg-muted-foreground text-background" },
  merged: { label: "Merged", className: "bg-violet-600 text-white" },
  closed: { label: "Closed", className: "bg-red-600 text-white" },
}

/** A pull request's state, title and number, linked to its page, and the branches it joins. */
export function PullRequestHeading({ pullRequest }: { readonly pullRequest: PullRequest }) {
  const terms = forgeTerms(pullRequest.forge)
  const state = STATE[pullRequest.state]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <Badge className={cn("shrink-0", state.className)}>{state.label}</Badge>
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
