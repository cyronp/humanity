import { readFile } from "node:fs/promises"
import { join } from "node:path"

const RUNNING_SETTINGS: ReadonlyArray<string> = [
  "hooks",
  "statusLine",
  "fileSuggestion",
  "apiKeyHelper",
  "awsAuthRefresh",
  "awsCredentialExport",
  "otelHeadersHelper",
  "env",
  "enableAllProjectMcpServers",
  "enabledMcpjsonServers",
  "enabledPlugins",
  "extraKnownMarketplaces",
]

export const claudeProjectSettingsPath = (cwd: string): string =>
  join(cwd, ".claude", "settings.json")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isEmpty = (value: unknown) =>
  value === null ||
  value === false ||
  (Array.isArray(value) && value.length === 0) ||
  (isRecord(value) && Object.keys(value).length === 0)

const TRUST_HINT = `If you trust this repository, turn on "Use this repository's Claude Code settings" in Settings, under Projects, then send your message again.`

const unreadable = (path: string) =>
  `Humanity could not read ${path}, so it cannot tell whether this repository's Claude Code settings would run programs of their own. ${TRUST_HINT}`

const isMissing = (cause: unknown) =>
  isRecord(cause) && (cause["code"] === "ENOENT" || cause["code"] === "ENOTDIR")

export const claudeProjectSettingsProblem = (
  text: string | undefined,
  path: string,
): string | undefined => {
  if (text === undefined || text.trim() === "") return undefined
  let settings: unknown
  try {
    settings = JSON.parse(text)
  } catch {
    return unreadable(path)
  }
  if (!isRecord(settings)) return undefined
  const found = RUNNING_SETTINGS.filter((key) => key in settings && !isEmpty(settings[key]))
  if (found.length === 0) return undefined
  return `This repository's Claude Code settings (${path}) can run programs before the thread's mode decides anything: ${found.map((key) => `"${key}"`).join(", ")}. Claude Code was not started, so nothing of them ran. ${TRUST_HINT}`
}

export const readClaudeProjectSettingsProblem = async (
  cwd: string,
): Promise<string | undefined> => {
  const path = claudeProjectSettingsPath(cwd)
  const read = await readFile(path, "utf8").then(
    (text) => ({ text }),
    (cause: unknown) => (isMissing(cause) ? { text: undefined } : undefined),
  )
  return read === undefined ? unreadable(path) : claudeProjectSettingsProblem(read.text, path)
}
