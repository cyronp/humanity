import type { HandoffPreview } from "@humanity/contracts"

export const excludedOf = (preview: HandoffPreview | null): ReadonlySet<number> =>
  new Set(
    (preview?.entries ?? []).filter((entry) => entry.state === "cut").map((entry) => entry.index),
  )

export const toggledExclusion = (
  excluded: ReadonlySet<number>,
  index: number,
): ReadonlySet<number> => {
  const next = new Set(excluded)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return next
}

export const changedExclusions = (
  preview: HandoffPreview,
  excluded: ReadonlySet<number>,
): boolean => {
  const before = excludedOf(preview)
  return before.size !== excluded.size || [...excluded].some((index) => !before.has(index))
}
