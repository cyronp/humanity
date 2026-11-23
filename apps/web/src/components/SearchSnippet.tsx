import { snippetParts } from "@humanity/contracts"
import { cn } from "cn"

export function SearchSnippet({
  snippet,
  className,
}: {
  readonly snippet: string
  readonly className?: string
}) {
  return (
    <span className={cn("wrap-anywhere", className)}>
      {snippetParts(snippet).map((part, position) =>
        part.marked ? (
          <mark key={position} className="rounded-sm bg-warning/25 px-0.5 text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={position}>{part.text}</span>
        ),
      )}
    </span>
  )
}
