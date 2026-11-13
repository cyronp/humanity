import { Schema } from "effect"

/**
 * How Claude Code authenticates the agent sessions Humanity starts. Humanity
 * never holds the credential itself: it runs Claude Code (through the Agent
 * SDK), which uses whatever login is stored in its own config directory.
 */
export const ClaudeAuthMethod = Schema.Literals([
  /** A Claude Pro / Max / Team / Enterprise login made with `claude auth login`. */
  "subscription",
  /** An Anthropic API key or auth token, billed per token. */
  "apiKey",
  /** Amazon Bedrock, Google Vertex AI and other third-party providers. */
  "cloudProvider",
])
export type ClaudeAuthMethod = typeof ClaudeAuthMethod.Type

export const ClaudeConnection = Schema.TaggedUnion({
  /** Claude Code started and reported a credential it will use. */
  Connected: {
    method: ClaudeAuthMethod,
    /** One line for the human, e.g. "Claude Max" or "API key from ANTHROPIC_API_KEY". */
    label: Schema.String,
    email: Schema.NullOr(Schema.String),
    organization: Schema.NullOr(Schema.String),
    /**
     * An API key wins over a stored claude.ai login. When this is true the
     * subscription exists but is not used: usage is billed to the key.
     */
    subscriptionShadowed: Schema.Boolean,
  },
  /** Claude Code runs, but no login or key is configured. */
  SignedOut: {},
  /** Claude Code could not be started or did not answer. */
  Unavailable: { reason: Schema.String },
})
export type ClaudeConnection = typeof ClaudeConnection.Type

export const ClaudeModel = Schema.Struct({
  /** What to pass as the session's model, e.g. `opus` or `default`. */
  value: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
})
export type ClaudeModel = typeof ClaudeModel.Type

export const ClaudeStatus = Schema.Struct({
  connection: ClaudeConnection,
  /** The models Claude Code offers to this account, in its order. Empty when it could not be asked. */
  models: Schema.Array(ClaudeModel),
  /** Version of the Claude Code CLI that runs the sessions, when it reported one. */
  cliVersion: Schema.NullOr(Schema.String),
  /** Where Claude Code keeps its login (`CLAUDE_CONFIG_DIR`, else `~/.claude`). */
  configDir: Schema.String,
  /**
   * The Claude Code executable bundled with the Agent SDK, which Humanity runs.
   * Shown so a human without a global `claude` install can still sign in.
   */
  bundledExecutable: Schema.NullOr(Schema.String),
  /** ISO timestamp of the check this status comes from. */
  checkedAt: Schema.String,
})
export type ClaudeStatus = typeof ClaudeStatus.Type

/** The id of the login Claude Code uses by itself: `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export const DEFAULT_CLAUDE_ACCOUNT = "default"

/**
 * One Claude Code login Humanity can run sessions as. The default account is
 * the human's own Claude Code login; every other one is a separate Claude Code
 * config folder, either one Humanity made under its data directory or one the
 * human already had (like `~/.claude-personal`), signed in on its own.
 * Humanity stores only the name and the folder: the credential stays in it.
 */
export const ClaudeAccount = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The human's own Claude Code login. It cannot be removed. */
  isDefault: Schema.Boolean,
  /**
   * The account runs on a config folder the human picked, not one Humanity
   * made. Removing the account leaves that folder and its login alone.
   */
  linkedFolder: Schema.Boolean,
  /** New threads run as this account. Exactly one account is active. */
  active: Schema.Boolean,
  status: ClaudeStatus,
})
export type ClaudeAccount = typeof ClaudeAccount.Type
