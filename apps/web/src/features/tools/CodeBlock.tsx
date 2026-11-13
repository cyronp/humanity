import { cn } from "cn"
import { useMemo } from "react"
import type { BundledLanguage } from "shiki"
import {
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFooter,
  CodeBlock as CodeBlockFrame,
  CodeBlockLine,
} from "@/components/ui/code-block"
import { CodeLine } from "@/features/diff/HunkView"
import { useHighlightedLines } from "@/features/diff/highlighter"
import { parseAnsi } from "./ansi.ts"

/**
 * Read-only code with optional line numbers, on shadcn's Code Block and
 * highlighted with the shared Shiki instance and themes.
 */
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
    <CodeBlockFrame size="sm" className={cn("bg-muted/40", className)}>
      <CodeBlockActions>
        <CodeBlockCopyButton value={code} />
      </CodeBlockActions>
      <CodeBlockContent
        lineNumbers={firstLine !== undefined}
        startLine={firstLine ?? 1}
        className="leading-5"
      >
        {lines.map((line, position) => (
          <CodeBlockLine key={position}>
            <CodeLine text={line} tokens={tokens?.[position]} />
          </CodeBlockLine>
        ))}
      </CodeBlockContent>
      {all.length > lines.length && (
        <CodeBlockFooter className="border-t pt-1.5 text-xs">
          {all.length - lines.length} more lines not shown
        </CodeBlockFooter>
      )}
    </CodeBlockFrame>
  )
}

export function TerminalOutput({
  text,
  className,
}: {
  readonly text: string
  readonly className?: string
}) {
  const segments = useMemo(() => parseAnsi(text), [text])
  return (
    <CodeBlockFrame size="sm" className={cn("bg-muted/40", className)}>
      {segments.length > 0 && (
        <CodeBlockActions>
          <CodeBlockCopyButton value={segments.map((segment) => segment.text).join("")} />
        </CodeBlockActions>
      )}
      <CodeBlockContent wrap className="max-h-96 break-all">
        {segments.length === 0 ? (
          <span className="text-muted-foreground">(no output)</span>
        ) : (
          <span>
            {segments.map((segment, position) => (
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
            ))}
          </span>
        )}
      </CodeBlockContent>
    </CodeBlockFrame>
  )
}
