import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { baseLayer, tempDir } from "./helpers.ts"

const Pragma = Schema.Array(Schema.Record(Schema.String, Schema.Number))

describe("Database", () => {
  it.live("opens in WAL mode, syncing at checkpoints, with foreign keys enforced", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [mode] = yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`
        assert.strictEqual(mode?.journal_mode, "wal")
        const value = (rows: unknown) =>
          Object.values(Schema.decodeUnknownSync(Pragma)(rows)[0] ?? {})[0]
        // 1 is NORMAL.
        assert.strictEqual(value(yield* sql`PRAGMA synchronous`), 1)
        assert.strictEqual(value(yield* sql`PRAGMA foreign_keys`), 1)
      }).pipe(Effect.provide(baseLayer(home)))
    }),
  )
})
