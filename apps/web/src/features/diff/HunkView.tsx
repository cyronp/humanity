import type { DiffHunk } from "@humanity/contracts"
import { type DiffLine, hunkHeader, toDiffLines } from "@humanity/diff"
import { cn } from "cn"
import { type ReactNode, useMemo } from "react"
import { type CodeToken, languageForPath, useHighlightedLines } from "./highlighter.ts"
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
 * diffs); `actions` and `footer` are where a review adds its controls.
 */
export function HunkView({
  hunk,
  filePath,
  actions,
  footer,
  className,
}: {
  readonly hunk: DiffHunk
  readonly filePath: string
  readonly actions?: ReactNode
  readonly footer?: ReactNode
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
        {actions}
      </div>
      <ScrollArea orientation="horizontal">
        <table className="w-full border-collapse font-mono text-xs leading-5">
          <tbody>
            {rows.map((row, position) => (
              <tr key={position} className={ROW_STYLES[row.kind]}>
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
