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

/** One entry per migration file, keyed `<id>_<name>`. Never edit an applied migration; add a new one. */
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
}

const Migrations = SqliteMigrator.layer({ loader: SqliteMigrator.fromRecord(migrations) })

// SQLite only enforces ON DELETE CASCADE when foreign keys are switched on per connection.
const ForeignKeys = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`PRAGMA foreign_keys = ON`
  }),
)

const layerFor = (filename: string) =>
  Layer.mergeAll(Migrations, ForeignKeys).pipe(
    Layer.provideMerge(SqliteClient.layer({ filename })),
    Layer.orDie,
  )

/** The migrated database at `<home>/humanity.db`. */
export const DatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return layerFor(config.databasePath)
  }),
)

/** A private, migrated in-memory database for tests. */
export const DatabaseTest = layerFor(":memory:")
