/**
 * Where a project's favicon usually lives, most specific first. Paths are
 * relative to the repository root and only ever read.
 */
const ICON_FILES = [
  "favicon.svg",
  "favicon.png",
  "favicon.ico",
  "icon.svg",
  "icon.png",
  "logo.svg",
  "logo.png",
] as const

/** Folders that hold a web app's static icons, in the common frameworks' layouts. */
const ICON_FOLDERS = ["", "public", "static", "app", "src/app", "src", "assets", "src/assets"]

/** Candidates inside one app folder (the repository root, or `apps/web` in a monorepo). */
const candidatesIn = (base: string): Array<string> =>
  ICON_FOLDERS.flatMap((folder) =>
    ICON_FILES.map((file) => [base, folder, file].filter((part) => part !== "").join("/")),
  )

/** Workspace folders in a monorepo. Names that usually hold the web app come first. */
export const WORKSPACE_ROOTS = ["apps", "packages"] as const

const WEB_NAMES = ["web", "www", "site", "website", "frontend", "client", "app", "docs"]

const workspaceRank = (name: string) => {
  const index = WEB_NAMES.indexOf(name.toLowerCase())
  return index === -1 ? WEB_NAMES.length : index
}

/**
 * Every path to try, in order: the repository root first, then each
 * workspace package (`apps/<name>`, `packages/<name>`) found in it.
 */
export const iconCandidates = (
  workspaces: ReadonlyArray<{ readonly root: string; readonly names: ReadonlyArray<string> }>,
): Array<string> => [
  ...candidatesIn(""),
  ...workspaces.flatMap(({ root, names }) =>
    [...names]
      .sort((a, b) => workspaceRank(a) - workspaceRank(b) || a.localeCompare(b))
      .flatMap((name) => candidatesIn(`${root}/${name}`)),
  ),
]

const MIME_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
}

export const iconMimeType = (path: string): string | undefined =>
  MIME_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()]

/** Icons are shown at 16–20px; anything bigger than this is not a favicon. */
export const MAX_ICON_BYTES = 256 * 1024
