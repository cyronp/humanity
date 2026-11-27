import type { CodeToken } from "@/lib/highlighter"

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
