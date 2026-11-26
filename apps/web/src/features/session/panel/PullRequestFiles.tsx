import { useAtomSet } from "@effect/atom-react"
import {
  type PullRequest,
  type PullRequestFiles as Files,
  type Session,
  plural,
} from "@humanity/contracts"
import { Exit } from "effect"
import { ChevronDown, MessageSquareText, RefreshCw } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { FileDiffView } from "@/features/diff/FileDiffView"
import type { LineComments } from "@/features/diff/HunkView"
import { reviewComments, staleComments, useReviewComments } from "@/features/diff/reviewComments"
import { describeCause } from "@/lib/errors"
import { pullRequestFilesAtom, reviewPullRequestAtom } from "../atoms.ts"
import { forgeTerms } from "./publication.ts"
import { reviewCommentsKey, toReviewPayload } from "./pullRequestReview.ts"

export function PullRequestFiles({
  session,
  pullRequest,
}: {
  readonly session: Session
  readonly pullRequest: PullRequest
}) {
  const load = useAtomSet(pullRequestFilesAtom, { mode: "promiseExit" })
  const post = useAtomSet(reviewPullRequestAtom, { mode: "promiseExit" })
  const terms = forgeTerms(pullRequest.forge)
  const key = reviewCommentsKey(session.id, pullRequest.number)
  const comments = useReviewComments(key)
  const store = useMemo(() => reviewComments(key), [key])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState<Files>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [summary, setSummary] = useState("")
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState<string>()
  const [openFiles, setOpenFiles] = useState<ReadonlySet<string>>(new Set())

  const lineComments = useMemo(
    (): LineComments => ({
      list: comments,
      add: store.add,
      update: store.update,
      remove: store.remove,
    }),
    [comments, store],
  )

  const reload = async () => {
    setLoading(true)
    setError(undefined)
    const exit = await load({ payload: { sessionId: session.id } })
    setLoading(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    setLoaded(exit.value)
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && loaded === undefined && !loading) void reload()
  }

  const submit = async () => {
    if (loaded === undefined) return
    setPosting(true)
    setError(undefined)
    const exit = await post({
      payload: {
        sessionId: session.id,
        review: toReviewPayload(loaded.headSha, summary, comments),
      },
    })
    setPosting(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    setPosted(
      `Posted ${plural(comments.length, "comment")} on ${terms.symbol}${pullRequest.number}.`,
    )
    setSummary("")
    store.clear()
  }

  const files = loaded?.files ?? []
  const stale = staleComments(files, comments)
  const moved = loaded !== undefined && loaded.headSha !== pullRequest.headSha
  const live = pullRequest.state === "open" || pullRequest.state === "draft"

  return (
    <section className="flex flex-col gap-2" aria-label="Files changed">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 gap-2 px-2 text-sm font-medium"
          aria-expanded={open}
          onClick={toggle}
        >
          <ChevronDown className={open ? "" : "-rotate-90"} />
          Files changed
          {loaded !== undefined && (
            <span className="text-xs font-normal text-muted-foreground">{files.length}</span>
          )}
        </Button>
        {open && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label="Reload the files"
            title="Reload the files"
            disabled={loading}
            onClick={() => void reload()}
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        )}
      </div>
      {posted !== undefined && <p className="text-xs text-success">{posted}</p>}
      {error !== undefined && <p className="text-sm text-destructive">{error}</p>}
      {live && comments.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <p className="flex items-center gap-2">
            <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              {plural(comments.length, "comment")} for a review
              {stale.size > 0 && loaded !== undefined && (
                <span className="text-muted-foreground">
                  {" "}
                  · {stale.size} on line{stale.size === 1 ? "" : "s"} the {terms.noun} no longer
                  changes
                </span>
              )}
            </span>
          </p>
          <Input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Optional summary"
            aria-label="Review summary"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="xs" onClick={store.clear}>
              Discard
            </Button>
            <Button
              size="xs"
              disabled={posting || loaded === undefined || moved || stale.size > 0}
              title={`Post the comments on ${terms.site} as a review, under your account`}
              onClick={() => void submit()}
            >
              {posting && <Spinner />}
              Post as a review
            </Button>
          </div>
        </div>
      )}
      {open &&
        (moved ? (
          <p className="text-xs text-warning">
            The {terms.noun} has new commits since these files were read. Reload them before
            posting.
          </p>
        ) : loaded === undefined ? null : files.length === 0 ? (
          <p className="text-xs text-muted-foreground">The {terms.noun} changes no files.</p>
        ) : (
          <div className="flex flex-col">
            {files.map((file) => {
              const fileKey = `${file.kind}:${file.filePath}`
              return (
                <FileDiffView
                  key={fileKey}
                  file={file}
                  flat
                  comments={live ? lineComments : undefined}
                  open={openFiles.has(fileKey)}
                  onOpenChange={(next) =>
                    setOpenFiles((current) => {
                      const updated = new Set(current)
                      if (next) updated.add(fileKey)
                      else updated.delete(fileKey)
                      return updated
                    })
                  }
                />
              )
            })}
          </div>
        ))}
    </section>
  )
}
