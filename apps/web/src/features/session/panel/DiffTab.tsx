import { useAtomValue } from "@effect/atom-react"
import type { FileDiff, Session } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { MessageSquareText } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  formatReviewComments,
  reviewComments,
  staleComments,
  useReviewComments,
} from "@/features/diff/reviewComments"
import type { LineComments } from "@/features/diff/HunkView"
import { AsyncView } from "@/components/AsyncView"
import { OpenInBrowserButton } from "@/features/browser/OpenInBrowserButton"
import { FileDiffView } from "@/features/diff/FileDiffView"
import { publicationAtom, sessionDiffAtom } from "../atoms.ts"
import { CheckoutMovedNote } from "./CheckoutMovedNote.tsx"
import { checkoutMoved } from "./publication.ts"

export const fileKey = (file: FileDiff) => `${file.kind}:${file.filePath}`

export function DiffTab({
  session,
  onReference,
  open,
  onOpenChange,
  onInsert,
}: {
  readonly session: Session
  readonly onInsert?: ((text: string) => void) | undefined
  readonly onReference?: ((reference: string) => void) | undefined
  readonly open: ReadonlySet<string>
  readonly onOpenChange: (key: string, open: boolean) => void
}) {
  const diff = useAtomValue(sessionDiffAtom(session.id))
  const publication = useAtomValue(publicationAtom(session.id))
  const moved = AsyncResult.isSuccess(publication) && checkoutMoved(publication.value)
  const comments = useReviewComments(session.id)
  const store = useMemo(() => reviewComments(session.id), [session.id])
  const writable = session.status !== "ended"
  const lineComments = useMemo(
    (): LineComments | undefined =>
      writable
        ? { list: comments, add: store.add, update: store.update, remove: store.remove }
        : undefined,
    [comments, store, writable],
  )
  const files = AsyncResult.isSuccess(diff) ? diff.value.files : []
  const stale = staleComments(files, comments)
  if (moved) return <CheckoutMovedNote session={session} publication={publication.value} />
  return (
    <>
      {comments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm">
          <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            {comments.length} comment{comments.length === 1 ? "" : "s"} for the agent
            {stale.size > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {stale.size} on line{stale.size === 1 ? "" : "s"} no longer in the diff
              </span>
            )}
          </span>
          {onInsert !== undefined && (
            <Button
              size="xs"
              onClick={() => {
                onInsert(formatReviewComments(comments))
                store.clear()
              }}
              title="Put the comments in your message, to edit and send"
            >
              Add to my message
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={store.clear}>
            Discard
          </Button>
        </div>
      )}
      <AsyncView result={diff} errorTitle="Could not read the worktree">
        {(value) =>
          value.files.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No uncommitted changes on <code>{session.branch}</code>.
            </p>
          ) : (
            value.files.map((file) => {
              const key = fileKey(file)
              return (
                <FileDiffView
                  key={key}
                  file={file}
                  flat
                  onReference={onReference}
                  comments={lineComments}
                  editorRoot={session.worktreePath}
                  open={open.has(key)}
                  onOpenChange={(next) => onOpenChange(key, next)}
                  headerActions={
                    file.kind === "delete" ? undefined : (
                      <OpenInBrowserButton sessionId={session.id} path={file.filePath} />
                    )
                  }
                />
              )
            })
          )
        }
      </AsyncView>
    </>
  )
}
