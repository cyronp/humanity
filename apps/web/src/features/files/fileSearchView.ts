import type { FileSearchMatch } from "@humanity/contracts"

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const matchRange = (
  match: FileSearchMatch,
  query: string,
  options: { readonly caseSensitive: boolean; readonly regex: boolean },
): { readonly start: number; readonly length: number } | undefined => {
  if (query === "") return undefined
  const offset = match.preview.startsWith("…") ? 1 : 0
  const from = Math.max(0, match.column - 1 + offset)
  let pattern: RegExp
  try {
    pattern = new RegExp(
      options.regex ? query : escapeRegex(query),
      options.caseSensitive ? "g" : "gi",
    )
  } catch {
    return undefined
  }
  const search = (start: number) => {
    pattern.lastIndex = start
    const found = pattern.exec(match.preview)
    return found === null || found[0] === ""
      ? undefined
      : { start: found.index, length: found[0].length }
  }
  return (match.column - 1 < match.preview.length ? search(from) : undefined) ?? search(0)
}
