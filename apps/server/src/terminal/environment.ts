import { INHERITED_SESSION_VARIABLES } from "../claude/environment.ts"
import { INHERITED_CODEX_VARIABLES } from "../codex/environment.ts"

/** What the daemon itself was started with, which a terminal of the human's must not inherit. */
const DROPPED = new Set([
  ...INHERITED_SESSION_VARIABLES,
  ...INHERITED_CODEX_VARIABLES,
  "ELECTRON_RUN_AS_NODE",
  "NODE_COMPILE_CACHE",
  "INIT_CWD",
])

const isDropped = (key: string) =>
  DROPPED.has(key) ||
  key.toUpperCase().startsWith("HUMANITY_") ||
  // `npm run dev` adds its own configuration, which would steer npm in the human's project.
  key.startsWith("npm_")

/**
 * The environment of a terminal: the human's own, minus anything of Humanity's or of how the
 * daemon was started, plus what tells programs they run in a capable terminal.
 */
export const terminalEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !isDropped(key)) result[key] = value
  }
  result["TERM"] = "xterm-256color"
  result["COLORTERM"] = "truecolor"
  result["TERM_PROGRAM"] = "Humanity"
  return result
}
