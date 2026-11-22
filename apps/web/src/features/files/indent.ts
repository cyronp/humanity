export type DetectedIndent =
  { readonly kind: "tabs" } | { readonly kind: "spaces"; readonly size: number }

const SAMPLED_LINES = 2000
const MAX_SIZE = 8

export const detectIndent = (content: string): DetectedIndent | undefined => {
  let tabbed = 0
  let spaced = 0
  let previous = 0
  const deltas = new Map<number, number>()
  const lines = content.split("\n", SAMPLED_LINES)
  for (const line of lines) {
    if (line.trim() === "") continue
    if (line.startsWith("\t")) {
      tabbed++
      previous = 0
      continue
    }
    const spaces = line.length - line.trimStart().length
    if (spaces > 0) spaced++
    const delta = Math.abs(spaces - previous)
    if (delta > 0 && delta <= MAX_SIZE) deltas.set(delta, (deltas.get(delta) ?? 0) + 1)
    previous = spaces
  }
  if (tabbed === 0 && spaced === 0) return undefined
  if (tabbed > spaced) return { kind: "tabs" }
  let best: { size: number; count: number } | undefined
  for (const [size, count] of deltas) {
    if (best === undefined || count > best.count || (count === best.count && size < best.size)) {
      best = { size, count }
    }
  }
  return best === undefined ? undefined : { kind: "spaces", size: best.size }
}
