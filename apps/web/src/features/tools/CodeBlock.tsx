import { cn } from "cn"
import { useMemo } from "react"
import type { BundledLanguage } from "shiki"
import { CodeLine } from "@/features/diff/HunkView"
import { useHighlightedLines } from "@/features/diff/highlighter"
import { parseAnsi } from "./ansi.ts"

/** Read-only code with optional line numbers, highlighted with the shared Shiki themes. */
export function CodeBlock({
  code,
  language,
  firstLine,
  maxLines = 400,
  className,
}: {
  readonly code: string
  readonly language: BundledLanguage | undefined
  /** Shows line numbers starting here. */
  readonly firstLine?: number
  readonly maxLines?: number
  readonly className?: string
}) {
  const all = useMemo(() => code.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n"), [code])
  const lines = useMemo(() => all.slice(0, maxLines), [all, maxLines])
  const tokens = useHighlightedLines(lines, language)
  return (
    <div className={cn("overflow-auto rounded-md border bg-muted/40", className)}>
      <table className="w-full border-collapse font-mono text-xs leading-5">
        <tbody>
          {lines.map((line, position) => (
            <tr key={position}>
              {firstLine !== undefined && (
                <td className="w-10 min-w-10 border-r px-2 text-right text-muted-foreground/70 select-none">
                  {firstLine + position}
                </td>
              )}
              <td className="px-2 whitespace-pre">
                <CodeLine text={line} tokens={tokens?.[position]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {all.length > lines.length && (
        <p className="border-t px-2 py-1 text-xs text-muted-foreground">
          {all.length - lines.length} more lines not shown
        </p>
      )}
    </div>
  )
}

/** Terminal output with its ANSI colours turned into styles. */
export function TerminalOutput({
  text,
  className,
}: {
  readonly text: string
  readonly className?: string
}) {
  const segments = useMemo(() => parseAnsi(text), [text])
  return (
    <pre
      className={cn(
        "max-h-96 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap break-all",
        className,
      )}
    >
      {segments.length === 0 ? (
        <span className="text-muted-foreground">(no output)</span>
      ) : (
        segments.map((segment, position) => (
          <span
            key={position}
            className={cn(
              segment.color,
              segment.bold && "font-bold",
              segment.dim && "opacity-70",
              segment.underline && "underline",
            )}
          >
            {segment.text}
          </span>
        ))
      )}
    </pre>
  )
}
