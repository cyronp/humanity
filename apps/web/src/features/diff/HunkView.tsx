import type { DiffHunk } from "@humanity/contracts"
import {
  type DiffLine,
  hunkHeader,
  hunkReference,
  lineReference,
  toDiffLines,
} from "@humanity/diff"
import { cn } from "cn"
import { AtSign } from "lucide-react"
import { type ReactNode, useMemo } from "react"
import { type CodeToken, languageForPath, useHighlightedLines } from "./highlighter.ts"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

const ROW_STYLES: Record<DiffLine["kind"], string> = {
  add: "bg-emerald-500/12",
  remove: "bg-red-500/12",
  context: "",
  meta: "text-muted-foreground italic",
}

const SIGN: Record<DiffLine["kind"], string> = { add: "+", remove: "-", context: " ", meta: "" }

/**
 * One hunk: range header, line numbers, signs and highlighted code. It is the
 * single renderer for every diff in the app (reviews, tool cards and worktree
 * diffs); `actions` and `footer` are where a review adds its controls. With
 * `onReference`, the hunk and each of its lines get a button that hands a
 * `path:line` reference to the next message.
 */
export function HunkView({
  hunk,
  filePath,
  actions,
  footer,
  onReference,
  className,
}: {
  readonly hunk: DiffHunk
  readonly filePath: string
  readonly actions?: ReactNode
  readonly footer?: ReactNode
  readonly onReference?: ((reference: string) => void) | undefined
  readonly className?: string
}) {
  const rows = useMemo(() => toDiffLines(hunk), [hunk])
  const texts = useMemo(() => rows.map((row) => row.text), [rows])
  const tokens = useHighlightedLines(texts, languageForPath(filePath))

  return (
    <div className={cn("overflow-hidden rounded-md border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1.5">
        <code className="font-mono text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Hunk {hunk.index}</span> {hunkHeader(hunk)}
        </code>
        {(actions !== undefined || onReference !== undefined) && (
          <div className="flex items-center gap-1">
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
            {actions}
          </div>
        )}
      </div>
      <ScrollArea orientation="horizontal">
        <table className="w-full border-collapse font-mono text-xs leading-5">
          <tbody>
            {rows.map((row, position) => (
              <tr key={position} className={cn("group/row", ROW_STYLES[row.kind])}>
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
            ))}
          </tbody>
        </table>
      </ScrollArea>
      {footer}
    </div>
  )
}

/** The gutter button of one row, shown while the row is hovered or the button focused. */
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
          className="flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Reference ${reference} in your next message`}
          title={`Reference ${reference} in your next message`}
        >
          <AtSign className="size-3" />
        </button>
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

/** A line of code, highlighted once its tokens have loaded. */
export function CodeLine({
  text,
  tokens,
}: {
  readonly text: string
  readonly tokens: ReadonlyArray<CodeToken> | undefined
}) {
  if (tokens === undefined) return text === "" ? "​" : text
  if (tokens.length === 0) return "​"
  return tokens.map((token, position) => (
    <span key={position} className="shiki-token" style={token.style}>
      {token.content}
    </span>
  ))
}
