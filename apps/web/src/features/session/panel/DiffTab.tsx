import { useAtomValue } from "@effect/atom-react"
import type { FileDiff, Session } from "@humanity/contracts"
import { AsyncView } from "@/components/AsyncView"
import { FileDiffView } from "@/features/diff/FileDiffView"
import { sessionDiffAtom } from "../atoms.ts"

/** Tells two entries of one path apart: staged as deleted, and back on disk. */
export const fileKey = (file: FileDiff) => `${file.kind}:${file.filePath}`

/**
 * Every uncommitted change where the session works, one closed bar per file
 * until the human opens it.
 */
export function DiffTab({
  session,
  onReference,
  open,
  onOpenChange,
}: {
  readonly session: Session
  /** Puts a `path:line` reference in the message box; absent when no box can take it. */
  readonly onReference?: ((reference: string) => void) | undefined
  /** Files the human opened, by `fileKey`; kept by the panel so they stay open across tabs. */
  readonly open: ReadonlySet<string>
  readonly onOpenChange: (key: string, open: boolean) => void
}) {
  const diff = useAtomValue(sessionDiffAtom(session.id))
  return (
    <AsyncView result={diff} errorTitle="Could not read the worktree">
      {(value) =>
        value.files.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No uncommitted changes on <code>{session.branch}</code>.
          </p>
        ) : (
          value.files.map((file) => {
            const key = fileKey(file)
            return (
              <FileDiffView
                key={key}
                file={file}
                onReference={onReference}
                editorRoot={session.worktreePath}
                open={open.has(key)}
                onOpenChange={(next) => onOpenChange(key, next)}
              />
            )
          })
        )
      }
    </AsyncView>
  )
}
