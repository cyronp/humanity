import type { DiffHunk } from "@humanity/contracts"
import {
  currentLineNumbers,
  type DiffLine,
  hunkHeader,
  hunkReference,
  lineReference,
  toDiffLines,
} from "@humanity/diff"
import { cn } from "cn"
import { AtSign, MessageSquarePlus, Pencil, Trash2 } from "lucide-react"
import { Fragment, type ReactNode, useMemo, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { languageForPath, useHighlightedLines } from "@/lib/highlighter"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { vscodeUrl } from "@/lib/editor"
import { CodeLine } from "@/components/CodeLine"
import { type CommentAnchor, type ReviewComment, sameAnchor } from "./reviewComments.ts"
import { VsCodeIcon } from "./VsCodeIcon.tsx"

const GUTTER_BUTTON =
  "flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

const ROW_STYLES: Record<DiffLine["kind"], string> = {
  add: "bg-emerald-500/12",
  remove: "bg-red-500/12",
  context: "",
  meta: "text-muted-foreground italic",
}

const SIGN: Record<DiffLine["kind"], string> = { add: "+", remove: "-", context: " ", meta: "" }

export function HunkView({
  hunk,
  filePath,
  actions,
  footer,
  onReference,
  editorRoot,
  className,
  comments,
}: {
  readonly hunk: DiffHunk
  readonly filePath: string
  readonly actions?: ReactNode
  readonly footer?: ReactNode
  readonly onReference?: ((reference: string) => void) | undefined
  readonly editorRoot?: string | undefined
  readonly className?: string
  readonly comments?: LineComments | undefined
}) {
  return (
    <div className={cn("overflow-hidden rounded-md border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1.5">
        <code className="font-mono text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Hunk {hunk.index}</span> {hunkHeader(hunk)}
        </code>
        {(actions !== undefined || onReference !== undefined || editorRoot !== undefined) && (
          <div className="flex items-center gap-1">
            <HunkButtons
              hunk={hunk}
              filePath={filePath}
              onReference={onReference}
              editorRoot={editorRoot}
            />
            {actions}
          </div>
        )}
      </div>
      <HunkLines
        hunk={hunk}
        filePath={filePath}
        onReference={onReference}
        editorRoot={editorRoot}
        comments={comments}
      />
      {footer}
    </div>
  )
}

export interface LineComments {
  readonly list: ReadonlyArray<ReviewComment>
  readonly add: (anchor: CommentAnchor, body: string) => void
  readonly update: (id: string, body: string) => void
  readonly remove: (id: string) => void
}

interface HunkLinkProps {
  readonly hunk: DiffHunk
  readonly filePath: string
  readonly onReference?: ((reference: string) => void) | undefined
  readonly editorRoot?: string | undefined
  readonly comments?: LineComments | undefined
}

export const anchorOf = (filePath: string, row: DiffLine): CommentAnchor | undefined =>
  row.kind === "meta"
    ? undefined
    : row.kind === "remove"
      ? row.oldNumber === undefined
        ? undefined
        : { path: filePath, side: "old", line: row.oldNumber, lineText: row.text }
      : row.newNumber === undefined
        ? undefined
        : { path: filePath, side: "new", line: row.newNumber, lineText: row.text }

export function HunkButtons({ hunk, filePath, onReference, editorRoot }: HunkLinkProps) {
  return (
    <>
      {editorRoot !== undefined && (
        <Button variant="ghost" size="icon-xs" asChild>
          <a
            href={vscodeUrl(editorRoot, filePath, Math.max(1, hunk.newStart))}
            aria-label={`Open ${filePath} in VS Code`}
            title={`Open ${filePath} in VS Code`}
          >
            <VsCodeIcon />
          </a>
        </Button>
      )}
      {onReference !== undefined && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onReference(hunkReference(filePath, hunk))}
          title="Reference this hunk in your next message"
        >
          <AtSign />
          Reference
        </Button>
      )}
    </>
  )
}

const PINNED_TO_VIEW = "sticky left-0 w-[100cqw] px-2"

export function HunkLines({ hunk, filePath, onReference, editorRoot, comments }: HunkLinkProps) {
  const [writing, setWriting] = useState<CommentAnchor>()
  const rows = useMemo(() => toDiffLines(hunk), [hunk])
  const current = useMemo(() => currentLineNumbers(rows), [rows])
  const texts = useMemo(() => rows.map((row) => row.text), [rows])
  const tokens = useHighlightedLines(texts, languageForPath(filePath))

  return (
    <ScrollArea orientation="horizontal" className="@container/hunk">
      <table className="w-full border-collapse font-mono text-xs leading-5">
        <tbody>
          {rows.map((row, position) => {
            const anchor = comments === undefined ? undefined : anchorOf(filePath, row)
            const attached =
              anchor === undefined
                ? []
                : (comments?.list ?? []).filter((comment) => sameAnchor(comment, anchor))
            const span =
              4 +
              (editorRoot === undefined ? 0 : 1) +
              (onReference === undefined ? 0 : 1) +
              (comments === undefined ? 0 : 1)
            return (
              <Fragment key={position}>
                <tr className={cn("group/row", ROW_STYLES[row.kind])}>
                  {comments !== undefined && (
                    <td className="w-5 min-w-5 p-0 align-middle select-none">
                      {anchor !== undefined && (
                        <button
                          type="button"
                          onClick={() => setWriting(anchor)}
                          className={GUTTER_BUTTON}
                          aria-label={`Comment on line ${anchor.line} for the agent`}
                          title="Comment on this line for the agent"
                        >
                          <MessageSquarePlus className="size-3" />
                        </button>
                      )}
                    </td>
                  )}
                  {editorRoot !== undefined && (
                    <OpenLineCell root={editorRoot} filePath={filePath} line={current[position]} />
                  )}
                  {onReference !== undefined && (
                    <ReferenceCell
                      reference={lineReference(filePath, row)}
                      onReference={onReference}
                    />
                  )}
                  <LineNumber value={row.oldNumber} />
                  <LineNumber value={row.newNumber} />
                  <td
                    className={cn(
                      "w-5 px-1 text-center select-none",
                      row.kind === "add" && "text-emerald-600 dark:text-emerald-400",
                      row.kind === "remove" && "text-red-600 dark:text-red-400",
                    )}
                  >
                    {SIGN[row.kind]}
                  </td>
                  <td className="pr-4 whitespace-pre">
                    {row.kind === "meta" ? (
                      row.text
                    ) : (
                      <CodeLine text={row.text} tokens={tokens?.[position]} />
                    )}
                  </td>
                </tr>
                {comments !== undefined &&
                  attached.map((comment) => (
                    <tr key={comment.id}>
                      <td colSpan={span} className="border-y bg-muted/40 py-2 font-sans">
                        <div className={PINNED_TO_VIEW}>
                          <CommentCard comment={comment} comments={comments} />
                        </div>
                      </td>
                    </tr>
                  ))}
                {comments !== undefined &&
                  anchor !== undefined &&
                  writing !== undefined &&
                  sameAnchor(writing, anchor) && (
                    <tr>
                      <td colSpan={span} className="border-y bg-muted/40 py-2 font-sans">
                        <div className={PINNED_TO_VIEW}>
                          <CommentEditor
                            initial=""
                            onCancel={() => setWriting(undefined)}
                            onSave={(body) => {
                              comments.add(anchor, body)
                              setWriting(undefined)
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </ScrollArea>
  )
}

function CommentCard({
  comment,
  comments,
}: {
  readonly comment: ReviewComment
  readonly comments: LineComments
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <CommentEditor
        initial={comment.body}
        onCancel={() => setEditing(false)}
        onSave={(body) => {
          comments.update(comment.id, body)
          setEditing(false)
        }}
      />
    )
  }
  return (
    <div className="flex items-start gap-2 text-sm">
      <p className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{comment.body}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setEditing(true)}
        aria-label="Edit the comment"
        title="Edit"
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => comments.remove(comment.id)}
        aria-label="Delete the comment"
        title="Delete"
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function CommentEditor({
  initial,
  onSave,
  onCancel,
}: {
  readonly initial: string
  readonly onSave: (body: string) => void
  readonly onCancel: () => void
}) {
  const [body, setBody] = useState(initial)
  const save = () => {
    if (body.trim() !== "") onSave(body.trim())
  }
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            save()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
        }}
        placeholder="What should the agent do about this line?"
        className="min-h-16 text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="xs" disabled={body.trim() === ""} onClick={save}>
          Save comment
        </Button>
      </div>
    </div>
  )
}

function ReferenceCell({
  reference,
  onReference,
}: {
  readonly reference: string | undefined
  readonly onReference: (reference: string) => void
}) {
  return (
    <td className="w-5 min-w-5 p-0 align-middle select-none">
      {reference !== undefined && (
        <button
          type="button"
          onClick={() => onReference(reference)}
          className={GUTTER_BUTTON}
          aria-label={`Reference ${reference} in your next message`}
          title={`Reference ${reference} in your next message`}
        >
          <AtSign className="size-3" />
        </button>
      )}
    </td>
  )
}

function OpenLineCell({
  root,
  filePath,
  line,
}: {
  readonly root: string
  readonly filePath: string
  readonly line: number | undefined
}) {
  return (
    <td className="w-5 min-w-5 p-0 align-middle select-none">
      {line !== undefined && (
        <a
          href={vscodeUrl(root, filePath, line)}
          className={GUTTER_BUTTON}
          aria-label={`Open ${filePath}:${line} in VS Code`}
          title={`Open ${filePath}:${line} in VS Code`}
        >
          <VsCodeIcon className="size-3" />
        </a>
      )}
    </td>
  )
}

function LineNumber({ value }: { readonly value: number | undefined }) {
  return (
    <td className="w-10 min-w-10 border-r px-2 text-right text-muted-foreground/70 select-none">
      {value ?? ""}
    </td>
  )
}
