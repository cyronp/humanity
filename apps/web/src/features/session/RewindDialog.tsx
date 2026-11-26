import { useAtomSet } from "@effect/atom-react"
import {
  type ChatMessage,
  type CheckpointChange,
  type RewindPreview,
  type Session,
  plural,
} from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { History } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { describeCause } from "@/lib/errors"
import { rewindAtom, rewindPreviewAtom } from "./atoms.ts"

const CHANGE_LABEL: Record<
  CheckpointChange["since"],
  { readonly word: string; readonly tone: string }
> = {
  modified: { word: "restored", tone: "text-warning" },
  deleted: { word: "brought back", tone: "text-success" },
  added: { word: "deleted", tone: "text-destructive" },
}

export const rewindWarnings = (preview: RewindPreview): ReadonlyArray<string> => [
  ...(preview.checkpoint && preview.changed > 0 && preview.sharedCheckout
    ? [
        "This thread works in the project's checkout: other threads working there see the restored files too.",
      ]
    : []),
  ...(preview.busyTerminals > 0
    ? [
        `${plural(preview.busyTerminals, "terminal")} of this thread ${preview.busyTerminals === 1 ? "is" : "are"} running a command, which may change files again.`,
      ]
    : []),
]

export function RewindDialog({
  session,
  message,
  onClose,
  onRewound,
}: {
  readonly session: Session
  readonly message: ChatMessage | undefined
  readonly onClose: () => void
  readonly onRewound: (text: string) => void
}) {
  const loadPreview = useAtomSet(rewindPreviewAtom, { mode: "promiseExit" })
  const rewind = useAtomSet(rewindAtom, { mode: "promiseExit" })
  const [loaded, setLoaded] = useState<{
    readonly messageId: string
    readonly preview?: RewindPreview
    readonly error?: string
  }>()
  const [failure, setError] = useState<string>()
  const [pending, setPending] = useState<"files" | "all">()
  const messageId = message?.id

  useEffect(() => {
    if (messageId === undefined) return
    let current = true
    void loadPreview({ payload: { sessionId: session.id, messageId } }).then((exit) => {
      if (!current) return
      setLoaded(
        Exit.isSuccess(exit)
          ? { messageId, preview: exit.value }
          : { messageId, error: describeCause(exit.cause) },
      )
    })
    return () => {
      current = false
    }
  }, [loadPreview, messageId, session.id])

  const preview = loaded?.messageId === messageId ? loaded?.preview : undefined
  const error = failure ?? (loaded?.messageId === messageId ? loaded?.error : undefined)

  const text = message?.content._tag === "user" ? message.content.text : ""
  const busy = session.status === "running" || session.status === "waiting_for_human"

  const run = async (mode: "files" | "all") => {
    if (messageId === undefined || preview === undefined) return
    setPending(mode)
    setError(undefined)
    const exit = await rewind({
      payload: {
        sessionId: session.id,
        messageId,
        files: preview.checkpoint,
        conversation: mode === "all",
      },
    })
    setPending(undefined)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    if (mode === "all") onRewound(text)
    close()
  }

  const close = () => {
    setError(undefined)
    onClose()
  }

  return (
    <Dialog open={message !== undefined} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" />
            Rewind to before this message?
          </DialogTitle>
          <DialogDescription className="line-clamp-2 wrap-anywhere">“{text}”</DialogDescription>
        </DialogHeader>
        {preview === undefined ? (
          error === undefined ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Comparing the files with the checkpoint…
            </div>
          ) : null
        ) : (
          <RewindDetails preview={preview} />
        )}
        {busy && (
          <p className="text-sm text-warning">
            The agent is working. Stop it, or wait until it is done, before rewinding.
          </p>
        )}
        {error !== undefined && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {preview?.checkpoint === true && preview.changed > 0 && (
            <Button
              variant="outline"
              disabled={busy || pending !== undefined}
              onClick={() => void run("files")}
            >
              {pending === "files" && <Spinner />}
              Restore files only
            </Button>
          )}
          <Button
            disabled={busy || preview === undefined || pending !== undefined}
            onClick={() => void run("all")}
          >
            {pending === "all" && <Spinner />}
            {preview?.checkpoint === false ? "Rewind the conversation only" : "Rewind"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RewindDetails({ preview }: { readonly preview: RewindPreview }) {
  const warnings = rewindWarnings(preview)
  const more = preview.changed - preview.changes.length
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <p>
        Rewind removes this message and the {plural(preview.removedMessages - 1, "message")} after
        it, and the agent forgets them. Your message goes back into the box below, to edit and send
        again.
      </p>
      {!preview.checkpoint ? (
        <p className="text-muted-foreground">
          Humanity has no checkpoint of the files from before this message, so they stay as they
          are.
        </p>
      ) : preview.changed === 0 ? (
        <p className="text-muted-foreground">The files are as they were then.</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <p>
            {plural(preview.changed, "file")} go back to how {preview.changed === 1 ? "it" : "they"}{" "}
            were:
          </p>
          <ul className="max-h-48 overflow-y-auto rounded-md border p-2 font-mono text-xs">
            {preview.changes.map((change) => (
              <li key={change.path} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate" title={change.path}>
                  {change.path}
                </span>
                <span className={cn("shrink-0 font-sans", CHANGE_LABEL[change.since].tone)}>
                  {CHANGE_LABEL[change.since].word}
                </span>
              </li>
            ))}
            {more > 0 && <li className="text-muted-foreground">and {more} more</li>}
          </ul>
        </div>
      )}
      {warnings.map((warning) => (
        <p key={warning} className="text-warning">
          {warning}
        </p>
      ))}
    </div>
  )
}
