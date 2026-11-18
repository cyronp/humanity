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
import { linkLocalUrls, requestPreview } from "@/features/browser/browser"
import { CodeLine } from "@/features/diff/HunkView"
import { isMac } from "@/features/terminal/keys"
import { useHighlightedLines } from "@/features/diff/highlighter"
import { type AnsiSegment, parseAnsi } from "./ansi.ts"

export function CodeBlock({
  code,
  language,
  firstLine,
  maxLines = 400,
  className,
}: {
  readonly code: string
  readonly language: BundledLanguage | undefined
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
  links = false,
}: {
  readonly text: string
  readonly className?: string
  /** Local addresses become links that open in the thread's Browser. */
  readonly links?: boolean
}) {
  const segments = useMemo(() => parseAnsi(text), [text])
  const pieces = useMemo(() => (links ? linkLocalUrls(segments) : undefined), [links, segments])
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
              <span key={position} className={segmentClass(segment)}>
                {pieces === undefined
                  ? segment.text
                  : pieces[position]?.map((piece, index) =>
                      piece.url === undefined ? (
                        piece.text
                      ) : (
                        <LocalLink key={index} url={piece.url}>
                          {piece.text}
                        </LocalLink>
                      ),
                    )}
              </span>
            ))}
          </span>
        )}
      </CodeBlockContent>
    </CodeBlockFrame>
  )
}

const segmentClass = (segment: AnsiSegment) =>
  cn(
    segment.color,
    segment.bold && "font-bold",
    segment.dim && "opacity-70",
    segment.underline && "underline",
  )

/** A local address: a click opens it in the thread's Browser, Ctrl or Cmd-click in a new tab. */
function LocalLink({ url, children }: { readonly url: string; readonly children: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={`Preview ${url} (${isMac() ? "⌘-click" : "Ctrl+click"}: open in my browser)`}
      className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey) return
        if (requestPreview(url)) event.preventDefault()
      }}
    >
      {children}
    </a>
  )
}
