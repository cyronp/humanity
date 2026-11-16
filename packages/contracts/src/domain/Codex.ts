import { Schema } from "effect"

/**
 * How Codex authenticates the threads Humanity starts on it. Humanity never
 * holds the credential: it runs the Codex CLI, which uses the login stored in
 * its own folder (`CODEX_HOME`, else `~/.codex`).
 */
export const CodexAuthMethod = Schema.Literals([
  /** A ChatGPT login made with `codex login`. */
  "chatgpt",
  /** An OpenAI API key, billed per token. */
  "apiKey",
  /** Amazon Bedrock, Google Cloud and other providers Codex is configured for. */
  "cloudProvider",
])
export type CodexAuthMethod = typeof CodexAuthMethod.Type

export const CodexConnection = Schema.TaggedUnion({
  /** Codex started and reported the account it will use. */
  Connected: {
    method: CodexAuthMethod,
    /** One line for the human, e.g. "ChatGPT Plus" or "OpenAI API key". */
    label: Schema.String,
    email: Schema.NullOr(Schema.String),
  },
  /** Codex runs, but nobody is signed in. */
  SignedOut: {},
  /** Codex could not be started or did not answer. */
  Unavailable: { reason: Schema.String },
})
export type CodexConnection = typeof CodexConnection.Type

export const CodexModel = Schema.Struct({
  /** What to pass as the session's model, e.g. `gpt-5-codex`. */
  value: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  /** The model Codex picks for this account when a thread names none. */
  isDefault: Schema.Boolean,
})
export type CodexModel = typeof CodexModel.Type

export const CodexStatus = Schema.Struct({
  connection: CodexConnection,
  /** The models Codex offers to this account, in its order. Empty when it could not be asked. */
  models: Schema.Array(CodexModel),
  /** Version of the Codex CLI that runs the threads, when it reported one. */
  cliVersion: Schema.NullOr(Schema.String),
  /** Where Codex keeps its login and settings (`CODEX_HOME`, else `~/.codex`). */
  codexHome: Schema.NullOr(Schema.String),
  /**
   * The Codex executable Humanity runs: the one bundled with it, else `codex`
   * from the PATH. Shown so the human can sign in with the same one.
   */
  executable: Schema.String,
  /** ISO timestamp of the check this status comes from. */
  checkedAt: Schema.String,
})
export type CodexStatus = typeof CodexStatus.Type

/**
 * One Codex login Humanity can run threads as. The default account is the
 * human's own Codex login; every other one is a separate Codex folder
 * (`CODEX_HOME`), either one Humanity made under its data directory or one
 * the human already had (like `~/.codex-work`), signed in on its own.
 * Humanity stores only the name and the folder: the credential stays in it.
 */
export const CodexAccount = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The human's own Codex login. It cannot be removed. */
  isDefault: Schema.Boolean,
  /**
   * The account runs on a folder the human picked, not one Humanity made.
   * Removing the account leaves that folder and its login alone.
   */
  linkedFolder: Schema.Boolean,
  /** New Codex threads run as this account. Exactly one account is active. */
  active: Schema.Boolean,
  status: CodexStatus,
})
export type CodexAccount = typeof CodexAccount.Type
