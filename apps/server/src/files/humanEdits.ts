const LISTED = 20

export const humanEditsNote = (paths: ReadonlyArray<string>): string | undefined => {
  if (paths.length === 0) return undefined
  const listed =
    paths.length <= LISTED
      ? paths.join(", ")
      : `${paths.slice(0, LISTED).join(", ")} and ${paths.length - LISTED} more`
  return `[Humanity] The human edited ${paths.length === 1 ? "this file" : "these files"} in Humanity's editor: ${listed}. What you read from ${paths.length === 1 ? "it" : "them"} before is out of date: read ${paths.length === 1 ? "it" : "them"} again before you rely on ${paths.length === 1 ? "it" : "them"} or edit ${paths.length === 1 ? "it" : "them"}.`
}

export type HumanFileChange =
  | { readonly _tag: "created"; readonly path: string }
  | { readonly _tag: "renamed"; readonly from: string; readonly to: string }
  | { readonly _tag: "deleted"; readonly path: string }

const describeChange = (change: HumanFileChange): string => {
  switch (change._tag) {
    case "created":
      return `created ${change.path}`
    case "renamed":
      return `moved ${change.from} to ${change.to}`
    case "deleted":
      return `deleted ${change.path}`
  }
}

export const humanChangesNote = (changes: ReadonlyArray<HumanFileChange>): string | undefined => {
  if (changes.length === 0) return undefined
  const described = changes.map(describeChange)
  const listed =
    described.length <= LISTED
      ? described.join("; ")
      : `${described.slice(0, LISTED).join("; ")}; and ${described.length - LISTED} more`
  return `[Humanity] The human changed the files of this folder in Humanity's editor: ${listed}. Look at the folder again before you rely on what you saw of it.`
}
