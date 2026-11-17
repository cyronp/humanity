import { Schema } from "effect"
import { AgentProvider } from "./Provider.ts"

/**
 * The oldest version of each provider's CLI that Humanity is tested against.
 * Older ones still run threads, but the human is asked to update them.
 * Claude Code's follows the Agent SDK Humanity is built with (its
 * `claudeCodeVersion`); Kiro has none yet, so it is never called outdated.
 */
export const CLI_MINIMUM_VERSIONS: Readonly<Record<AgentProvider, string | null>> = {
  "claude-code": "2.1.321",
  codex: "0.169.0",
  kiro: null,
}

/** The command each provider's CLI is run as, from the PATH. */
export const CLI_COMMANDS: Readonly<Record<AgentProvider, string>> = {
  "claude-code": "claude",
  codex: "codex",
  kiro: "kiro-cli",
}

/** Where each provider explains how to install its CLI. */
export const CLI_INSTALL_URLS: Readonly<Record<AgentProvider, string>> = {
  "claude-code": "https://code.claude.com/docs/en/setup",
  codex: "https://github.com/openai/codex#installing-and-running-codex-cli",
  kiro: "https://kiro.dev/docs/cli/",
}

/**
 * A provider's CLI as installed on the human's computer. Humanity ships no
 * agent of its own: it runs the one the human installed and signed in to.
 */
export const AgentCli = Schema.Struct({
  provider: AgentProvider,
  /** The executable found on the PATH (or a usual install folder); `null` when it is not installed. */
  path: Schema.NullOr(Schema.String),
  /** What `<cli> --version` reported; `null` when it is missing or did not say. */
  version: Schema.NullOr(Schema.String),
  /** The oldest version Humanity is tested against; `null` when there is none. */
  minimumVersion: Schema.NullOr(Schema.String),
  /** The version is known and older than the minimum. Threads still run. */
  outdated: Schema.Boolean,
  /** The command the Update button runs, as the human would type it. */
  updateCommand: Schema.String,
  installUrl: Schema.String,
})
export type AgentCli = typeof AgentCli.Type

/** What updating a CLI did: the updater's own output, and the CLI as it is now. */
export const AgentCliUpdate = Schema.Struct({
  output: Schema.String,
  cli: AgentCli,
})
export type AgentCliUpdate = typeof AgentCliUpdate.Type
