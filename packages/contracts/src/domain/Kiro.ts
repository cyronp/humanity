import { Schema } from "effect"

/**
 * Kiro (Beta) runs the threads Humanity starts on it: the Kiro CLI, started as
 * `kiro-cli acp`, which speaks the Agent Client Protocol. Humanity never holds
 * the credential: the CLI uses the login stored in its own folder (`KIRO_HOME`,
 * else `~/.kiro`).
 */
export const KiroConnection = Schema.TaggedUnion({
  /** Kiro started and opened a session, so it is signed in. */
  Connected: {
    /** One line for the human, e.g. "Kiro CLI 2.32.0". */
    label: Schema.String,
  },
  /** Kiro runs, but nobody is signed in. */
  SignedOut: {},
  /** Kiro could not be started or did not answer. */
  Unavailable: { reason: Schema.String },
})
export type KiroConnection = typeof KiroConnection.Type

export const KiroModel = Schema.Struct({
  /** What to pass as the session's model, e.g. `claude-sonnet`. */
  value: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
})
export type KiroModel = typeof KiroModel.Type

export const KiroStatus = Schema.Struct({
  connection: KiroConnection,
  /** The models Kiro offers to this account, in its order. Empty when it could not be asked. */
  models: Schema.Array(KiroModel),
  /** Version of the Kiro CLI that runs the threads, when it reported one. */
  cliVersion: Schema.NullOr(Schema.String),
  /** Where Kiro keeps its login and settings (`KIRO_HOME`, else `~/.kiro`). */
  kiroHome: Schema.NullOr(Schema.String),
  /** The Kiro executable Humanity runs: `kiro-cli` from the PATH. */
  executable: Schema.String,
  /** ISO timestamp of the check this status comes from. */
  checkedAt: Schema.String,
})
export type KiroStatus = typeof KiroStatus.Type

/**
 * One Kiro login Humanity can run threads as. The default account is the
 * human's own Kiro login; every other one is a separate Kiro folder
 * (`KIRO_HOME`), either one Humanity made under its data directory or one the
 * human already had, signed in on its own. Humanity stores only the name and
 * the folder: the credential stays in it.
 */
export const KiroAccount = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The human's own Kiro login. It cannot be removed. */
  isDefault: Schema.Boolean,
  /** The account runs on a folder the human picked, not one Humanity made. */
  linkedFolder: Schema.Boolean,
  /** New Kiro threads run as this account. Exactly one account is active. */
  active: Schema.Boolean,
  status: KiroStatus,
})
export type KiroAccount = typeof KiroAccount.Type
