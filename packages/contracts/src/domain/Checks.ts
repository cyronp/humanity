import { Schema } from "effect"

export const ChecksOutcome = Schema.Literals(["passed", "failed", "timeout", "untracked"])
export type ChecksOutcome = typeof ChecksOutcome.Type

export const ChecksResult = Schema.Struct({
  terminalId: Schema.String,
  command: Schema.String,
  outcome: ChecksOutcome,
  exitCode: Schema.NullOr(Schema.Number),
  output: Schema.String,
})
export type ChecksResult = typeof ChecksResult.Type

export const CHECKS_TIMEOUT_MS = 1_800_000
export const CHECKS_OUTPUT_LINES = 200
export const CHECKS_MESSAGE_LINES = 80

export const checksMessage = (result: ChecksResult): string => {
  const lines = result.output.replace(/\s+$/, "").split(/\r?\n/)
  const shown = lines.slice(-CHECKS_MESSAGE_LINES)
  const fence = "`".repeat(
    Math.max(3, ...[...result.output.matchAll(/`{3,}/g)].map((match) => match[0].length + 1)),
  )
  return [
    `The checks failed${result.exitCode === null ? "" : ` (exit code ${result.exitCode})`}: \`${result.command}\``,
    "",
    shown.length < lines.length ? `Their last ${shown.length} lines of output:` : "Their output:",
    fence,
    ...shown,
    fence,
    "",
    "Fix what fails, then run the checks again.",
  ].join("\n")
}
