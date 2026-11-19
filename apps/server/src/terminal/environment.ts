import { INHERITED_SESSION_VARIABLES } from "../claude/environment.ts"
import { INHERITED_CODEX_VARIABLES } from "../codex/environment.ts"

const DROPPED = new Set([
  ...INHERITED_SESSION_VARIABLES,
  ...INHERITED_CODEX_VARIABLES,
  "ELECTRON_RUN_AS_NODE",
  "NODE_COMPILE_CACHE",
  "INIT_CWD",
])

const isDropped = (key: string) =>
  DROPPED.has(key) || key.toUpperCase().startsWith("HUMANITY_") || key.startsWith("npm_")

export const terminalEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || isDropped(key)) continue
    if (platform === "win32" && key.toUpperCase() === "PSMODULEPATH") continue
    result[key] = value
  }
  result["TERM"] = "xterm-256color"
  result["COLORTERM"] = "truecolor"
  result["TERM_PROGRAM"] = "Humanity"
  return result
}
