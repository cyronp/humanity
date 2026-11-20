import { useAtomValue } from "@effect/atom-react"
import type { FileDiff, Session } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
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
}: {
  readonly session: Session
  readonly onReference?: ((reference: string) => void) | undefined
  readonly open: ReadonlySet<string>
  readonly onOpenChange: (key: string, open: boolean) => void
}) {
  const diff = useAtomValue(sessionDiffAtom(session.id))
  const publication = useAtomValue(publicationAtom(session.id))
  const moved = AsyncResult.isSuccess(publication) && checkoutMoved(publication.value)
  if (moved) return <CheckoutMovedNote session={session} publication={publication.value} />
  return (
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
  )
}
