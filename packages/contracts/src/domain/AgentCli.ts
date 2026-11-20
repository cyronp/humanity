import { Schema } from "effect"
import { AgentProvider } from "./Provider.ts"

export const CLI_MINIMUM_VERSIONS: Readonly<Record<AgentProvider, string | null>> = {
  "claude-code": "2.1.321",
  codex: "0.169.0",
  kiro: "3.0.0",
  antigravity: "1.5.2",
}

export const CLI_COMMANDS: Readonly<Record<AgentProvider, string>> = {
  "claude-code": "claude",
  codex: "codex",
  kiro: "kiro-cli",
  antigravity: "agy",
}

export const CLI_INSTALL_URLS: Readonly<Record<AgentProvider, string>> = {
  "claude-code": "https://code.claude.com/docs/en/setup",
  codex: "https://github.com/openai/codex#installing-and-running-codex-cli",
  kiro: "https://kiro.dev/docs/cli/",
  antigravity: "https://antigravity.google/docs/getting-started?tab=cli",
}

export const AgentCli = Schema.Struct({
  provider: AgentProvider,
  path: Schema.NullOr(Schema.String),
  version: Schema.NullOr(Schema.String),
  minimumVersion: Schema.NullOr(Schema.String),
  outdated: Schema.Boolean,
  updateCommand: Schema.String,
  installUrl: Schema.String,
})
export type AgentCli = typeof AgentCli.Type

export const AgentCliUpdate = Schema.Struct({
  output: Schema.String,
  cli: AgentCli,
})
export type AgentCliUpdate = typeof AgentCliUpdate.Type
