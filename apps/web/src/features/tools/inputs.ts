import type { ToolCall } from "@humanity/contracts"

/** Pure helpers that read the tool inputs and outputs the renderers show. */

export const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export const stringField = (value: unknown, key: string): string | undefined => {
  const field = asRecord(value)[key]
  return typeof field === "string" && field !== "" ? field : undefined
}

export const numberField = (value: unknown, key: string): number | undefined => {
  const field = asRecord(value)[key]
  return typeof field === "number" && Number.isFinite(field) ? field : undefined
}

/** The one input value that best describes a call, for a summary line. */
export const describeInput = (input: unknown): string => {
  for (const key of ["command", "file_path", "notebook_path", "pattern", "url", "query", "skill"]) {
    const value = stringField(input, key)
    if (value !== undefined) return value
  }
  const first = Object.values(asRecord(input)).find((value) => typeof value === "string")
  return typeof first === "string" ? first : ""
}

/** `src/app.ts` from an absolute path inside a worktree, for compact display. */
export const shortPath = (path: string, worktreePath?: string): string => {
  const normalized = path.replace(/\\/g, "/")
  const root = worktreePath?.replace(/\\/g, "/").replace(/\/$/, "")
  if (root !== undefined && normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return normalized.slice(root.length + 1)
  }
  return normalized
}

/** "lines 10–29" for a Read with offset/limit, `undefined` for a whole-file read. */
export const readRange = (input: unknown): string | undefined => {
  const offset = numberField(input, "offset")
  const limit = numberField(input, "limit")
  if (offset === undefined && limit === undefined) return undefined
  const start = offset ?? 1
  return limit === undefined ? `from line ${start}` : `lines ${start}–${start + limit - 1}`
}

/**
 * The file content of a Read result, without the `   12→` line-number gutter
 * the tool adds, plus the first line number shown.
 */
export const parseReadOutput = (
  output: string,
): { readonly firstLine: number; readonly lines: Array<string> } => {
  const rows = output.replace(/\r\n/g, "\n").split("\n")
  const gutter = /^\s*(\d+)(?:→|\t)(.*)$/
  const first = gutter.exec(rows[0] ?? "")
  if (first === null) return { firstLine: 1, lines: rows }
  const lines: Array<string> = []
  for (const row of rows) {
    const match = gutter.exec(row)
    if (match === null) break
    lines.push(match[2] ?? "")
  }
  return { firstLine: Number(first[1]), lines }
}

/** Non-empty output lines, for Glob and Grep result lists. */
export const resultLines = (output: string): Array<string> =>
  output
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")

/** Bash's structured result, when the SDK provided one. */
export const bashOutput = (
  call: ToolCall | undefined,
):
  | { readonly stdout: string; readonly stderr: string; readonly interrupted: boolean }
  | undefined => {
  const structured = asRecord(call?.structuredOutput)
  const stdout = structured["stdout"]
  const stderr = structured["stderr"]
  if (typeof stdout !== "string" && typeof stderr !== "string") return undefined
  return {
    stdout: typeof stdout === "string" ? stdout : "",
    stderr: typeof stderr === "string" ? stderr : "",
    interrupted: structured["interrupted"] === true,
  }
}

/** Milliseconds between a call's start and finish, if it finished. */
export const durationMs = (call: ToolCall): number | undefined => {
  if (call.finishedAt === null) return undefined
  const ms = Date.parse(call.finishedAt) - Date.parse(call.startedAt)
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}

export const formatDuration = (ms: number): string =>
  ms < 1000
    ? `${ms} ms`
    : ms < 60_000
      ? `${(ms / 1000).toFixed(1)} s`
      : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
