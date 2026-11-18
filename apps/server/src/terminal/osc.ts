/** What one OSC 133 mark says about the shell's commands. */
export type CommandMark =
  | { readonly _tag: "PromptStart" }
  | { readonly _tag: "CommandStart" }
  | { readonly _tag: "CommandEnd"; readonly exitCode: number | null }

/** OSC 133's payload: `A` (prompt), `C` (the command runs), `D;<exit code>` (it ended). */
export const parseCommandMark = (data: string): CommandMark | undefined => {
  const [kind, ...rest] = data.split(";")
  switch (kind) {
    case "A":
      return { _tag: "PromptStart" }
    case "C":
      return { _tag: "CommandStart" }
    case "D": {
      const code = rest[0] === undefined || rest[0] === "" ? Number.NaN : Number(rest[0])
      return { _tag: "CommandEnd", exitCode: Number.isInteger(code) ? code : null }
    }
    default:
      return undefined
  }
}

/**
 * The folder an OSC 7 mark (`file://<host>/<path>`) names, as the daemon's platform writes it,
 * or `undefined` when it names none it can use. On Windows the shells write `/C:/…` (PowerShell)
 * or `/c/…` (Git Bash); a path of Git Bash's own (`/usr/bin`) or of WSL has no Windows folder.
 */
export const folderFromOsc7 = (data: string, platform: NodeJS.Platform): string | undefined => {
  const match = /^file:\/\/[^/]*(\/.*)$/.exec(data)
  const path = match?.[1]
  if (path === undefined || path === "") return undefined
  if (platform !== "win32") return path
  const drive = /^\/([A-Za-z]):?(\/.*)?$/.exec(path)
  if (drive === null) return undefined
  const letter = (drive[1] ?? "").toUpperCase()
  const rest = (drive[2] ?? "/").replaceAll("/", "\\")
  return `${letter}:${rest}`
}

/** Whether `path` is `folder` or inside it, whatever the case on Windows. */
export const isInsideFolder = (
  folder: string,
  path: string,
  platform: NodeJS.Platform,
): boolean => {
  const separator = platform === "win32" ? "\\" : "/"
  const normalize = (value: string) => {
    const trimmed = value.replace(/[\\/]+$/, "")
    const unified = platform === "win32" ? trimmed.replaceAll("/", "\\").toLowerCase() : trimmed
    return unified === "" ? separator : unified
  }
  const base = normalize(folder)
  const candidate = normalize(path)
  return (
    candidate === base || candidate.startsWith(base.endsWith(separator) ? base : base + separator)
  )
}
