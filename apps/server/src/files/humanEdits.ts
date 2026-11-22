const LISTED = 20

export const humanEditsNote = (paths: ReadonlyArray<string>): string | undefined => {
  if (paths.length === 0) return undefined
  const listed =
    paths.length <= LISTED
      ? paths.join(", ")
      : `${paths.slice(0, LISTED).join(", ")} and ${paths.length - LISTED} more`
  return `[Humanity] The human edited ${paths.length === 1 ? "this file" : "these files"} in Humanity's editor: ${listed}. What you read from ${paths.length === 1 ? "it" : "them"} before is out of date: read ${paths.length === 1 ? "it" : "them"} again before you rely on ${paths.length === 1 ? "it" : "them"} or edit ${paths.length === 1 ? "it" : "them"}.`
}
