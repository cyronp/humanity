import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { ServerConfig } from "../ServerConfig.ts"
import initial from "./migrations/0001_initial.ts"
import sessionModel from "./migrations/0002_session_model.ts"
import sessionAutonomy from "./migrations/0003_session_autonomy.ts"
import attachments from "./migrations/0004_attachments.ts"
import sessionWorktree from "./migrations/0005_session_worktree.ts"
import sessionEffort from "./migrations/0006_session_effort.ts"
import sessionUsage from "./migrations/0007_session_usage.ts"
import preferences from "./migrations/0008_preferences.ts"
import sessionImport from "./migrations/0009_session_import.ts"
import confirmationAnswers from "./migrations/0010_confirmation_answers.ts"
import claudeAccounts from "./migrations/0011_claude_accounts.ts"
import openThreadPolicy from "./migrations/0012_open_thread_policy.ts"
import defaultAutonomy from "./migrations/0013_default_autonomy.ts"
import dropPolicyAndHunkDecisions from "./migrations/0014_drop_policy_and_hunk_decisions.ts"
import projectGitLab from "./migrations/0015_project_gitlab.ts"
import claudeAccountFolder from "./migrations/0016_claude_account_folder.ts"
import sessionProvider from "./migrations/0017_session_provider.ts"
import codexAccounts from "./migrations/0018_codex_accounts.ts"
import kiroAccounts from "./migrations/0019_kiro_accounts.ts"
import messagesBySession from "./migrations/0020_messages_by_session.ts"
import terminals from "./migrations/0021_terminals.ts"
import terminalOwners from "./migrations/0022_terminal_owners.ts"

const migrations = {
  "0001_initial": initial,
  "0002_session_model": sessionModel,
  "0003_session_autonomy": sessionAutonomy,
  "0004_attachments": attachments,
  "0005_session_worktree": sessionWorktree,
  "0006_session_effort": sessionEffort,
  "0007_session_usage": sessionUsage,
  "0008_preferences": preferences,
  "0009_session_import": sessionImport,
  "0010_confirmation_answers": confirmationAnswers,
  "0011_claude_accounts": claudeAccounts,
  "0012_open_thread_policy": openThreadPolicy,
  "0013_default_autonomy": defaultAutonomy,
  "0014_drop_policy_and_hunk_decisions": dropPolicyAndHunkDecisions,
  "0015_project_gitlab": projectGitLab,
  "0016_claude_account_folder": claudeAccountFolder,
  "0017_session_provider": sessionProvider,
  "0018_codex_accounts": codexAccounts,
  "0019_kiro_accounts": kiroAccounts,
  "0020_messages_by_session": messagesBySession,
  "0021_terminals": terminals,
  "0022_terminal_owners": terminalOwners,
}

const Migrations = SqliteMigrator.layer({ loader: SqliteMigrator.fromRecord(migrations) })

const Pragmas = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`PRAGMA foreign_keys = ON`
    yield* sql`PRAGMA synchronous = NORMAL`
  }),
)

const layerFor = (filename: string) =>
  Layer.mergeAll(Migrations, Pragmas).pipe(
    Layer.provideMerge(SqliteClient.layer({ filename })),
    Layer.orDie,
  )

export const DatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return layerFor(config.databasePath)
  }),
)

export const DatabaseTest = layerFor(":memory:")
