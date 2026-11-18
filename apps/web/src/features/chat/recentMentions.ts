import { RECENT_MENTION_LIMIT } from "@humanity/contracts"

const STORAGE_KEY = "humanity.recentMentions"
const SCOPE_LIMIT = 64

type Scopes = ReadonlyArray<readonly [string, ReadonlyArray<string>]>

const readScopes = (): Scopes => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry: unknown) =>
      Array.isArray(entry) && typeof entry[0] === "string" && Array.isArray(entry[1])
        ? [
            [
              entry[0],
              (entry[1] as ReadonlyArray<unknown>)
                .filter((path): path is string => typeof path === "string")
                .slice(0, RECENT_MENTION_LIMIT),
            ] as const,
          ]
        : [],
    )
  } catch {
    return []
  }
}

export const readRecentMentions = (scope: string): ReadonlyArray<string> =>
  readScopes().find(([key]) => key === scope)?.[1] ?? []

export const rememberMentions = (
  scope: string,
  paths: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const scopes = readScopes()
  const previous = scopes.find(([key]) => key === scope)?.[1] ?? []
  if (paths.length === 0) return previous
  const next = [...new Set([...paths, ...previous])].slice(0, RECENT_MENTION_LIMIT)
  const kept = [...scopes.filter(([key]) => key !== scope), [scope, next] as const].slice(
    -SCOPE_LIMIT,
  )
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept))
  } catch {
    return next
  }
  return next
}
