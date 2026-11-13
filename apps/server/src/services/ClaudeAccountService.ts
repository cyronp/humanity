import {
  type ClaudeAccount,
  ClaudeAccountInUse,
  ClaudeAccountNameInvalid,
  ClaudeAccountNotFound,
  type ClaudeStatus,
  DEFAULT_CLAUDE_ACCOUNT,
} from "@humanity/contracts"
import {
  Context,
  DateTime,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Result,
  Schema,
} from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { classifyAccount } from "../claude/account.ts"
import { ClaudeCode } from "../claude/ClaudeCode.ts"
import { isInsideDir } from "../paths.ts"
import { ServerConfig } from "../ServerConfig.ts"

/** A working login rarely changes; anything else is re-checked soon, so a fresh login shows up. */
const CONNECTED_TTL = Duration.minutes(5)
const OTHER_TTL = Duration.seconds(10)

const ACTIVE_ACCOUNT_KEY = "active_claude_account"
const DEFAULT_NAME = "Default login"
const MAX_NAME_LENGTH = 60

const AccountRow = Schema.Struct({ id: Schema.String, name: Schema.String })
const ActiveRow = Schema.Struct({ value_json: Schema.fromJsonString(Schema.String) })
const CountRow = Schema.Struct({ count: Schema.Number })

interface StatusCheck {
  readonly cached: Effect.Effect<ClaudeStatus>
  readonly invalidate: Effect.Effect<void>
}

export class ClaudeAccountService extends Context.Service<
  ClaudeAccountService,
  {
    /** The active account's status. Concurrent callers share one check. */
    readonly status: (options: { readonly refresh: boolean }) => Effect.Effect<ClaudeStatus>
    /** Every account with its status, the default login first. */
    readonly accounts: (options: {
      readonly refresh: boolean
    }) => Effect.Effect<ReadonlyArray<ClaudeAccount>>
    /** Adds an account with an empty Claude Code config folder of its own: signed out until the human signs in. */
    readonly add: (name: string) => Effect.Effect<ClaudeAccount, ClaudeAccountNameInvalid>
    /** Removes an added account and its config folder. Never the default login. */
    readonly remove: (
      accountId: string,
    ) => Effect.Effect<void, ClaudeAccountNotFound | ClaudeAccountInUse>
    readonly setActive: (accountId: string) => Effect.Effect<void, ClaudeAccountNotFound>
    readonly activeId: Effect.Effect<string>
    /**
     * The config folder Claude Code runs with for an account; `undefined` means
     * its default login, which is also what an account that no longer exists
     * falls back to.
     */
    readonly configDirFor: (accountId: string | null) => Effect.Effect<string | undefined>
  }
>()("humanity/ClaudeAccountService") {
  static readonly layer = Layer.effect(
    ClaudeAccountService,
    Effect.gen(function* () {
      const claude = yield* ClaudeCode
      const config = yield* ServerConfig
      const fs = yield* FileSystem.FileSystem
      const sql = yield* SqlClient.SqlClient

      const dirOf = (accountId: string) => join(config.accountsDir, accountId)

      const check = (configDir: string | undefined) =>
        Effect.gen(function* () {
          const result = yield* Effect.result(claude.probe(configDir))
          const checkedAt = DateTime.formatIso(yield* DateTime.now)
          const base = {
            configDir: configDir ?? claude.configDir,
            bundledExecutable: claude.bundledExecutable,
            checkedAt,
          }
          if (Result.isFailure(result)) {
            yield* Effect.logWarning("Claude Code check failed", result.failure.reason)
            return {
              ...base,
              connection: { _tag: "Unavailable", reason: result.failure.reason },
              models: [],
              cliVersion: null,
            } satisfies ClaudeStatus
          }
          return {
            ...base,
            connection: classifyAccount(result.success.account),
            models: result.success.models,
            cliVersion: result.success.cliVersion ?? null,
          } satisfies ClaudeStatus
        }).pipe(Effect.withSpan("ClaudeAccountService.check"))

      const makeCheck = (configDir: string | undefined) =>
        Effect.map(
          Effect.cachedInvalidateWithTTL(check(configDir), (exit) =>
            Exit.isSuccess(exit) && exit.value.connection._tag === "Connected"
              ? CONNECTED_TTL
              : OTHER_TTL,
          ),
          ([cached, invalidate]): StatusCheck => ({ cached, invalidate }),
        )

      const selectAccounts = SqlSchema.findAll({
        Request: Schema.Void,
        Result: AccountRow,
        execute: () => sql`SELECT id, name FROM claude_accounts ORDER BY created_at, rowid`,
      })
      const selectActive = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: ActiveRow,
        execute: (key) => sql`SELECT value_json FROM preferences WHERE key = ${key}`,
      })
      const countOpenSessions = SqlSchema.findAll({
        Request: Schema.String,
        Result: CountRow,
        execute: (accountId) =>
          sql`SELECT COUNT(*) AS count FROM sessions WHERE claude_account_id = ${accountId} AND status != 'ended'`,
      })

      const added = selectAccounts(undefined).pipe(Effect.orDie)

      // One cached check per account, made when the account first appears.
      const checks = new Map<string, StatusCheck>()
      checks.set(DEFAULT_CLAUDE_ACCOUNT, yield* makeCheck(undefined))
      for (const row of yield* added) checks.set(row.id, yield* makeCheck(dirOf(row.id)))

      const activeId = Effect.gen(function* () {
        const stored = yield* selectActive(ACTIVE_ACCOUNT_KEY).pipe(
          // A value this version cannot read is no choice: the default login.
          Effect.catch(() => Effect.succeedNone),
        )
        return stored.pipe(
          Effect.fromOption,
          Effect.map((row) => row.value_json),
          Effect.filterOrFail((id) => checks.has(id)),
          Effect.orElseSucceed(() => DEFAULT_CLAUDE_ACCOUNT),
        )
      }).pipe(Effect.flatten)

      const statusOf = (accountId: string, refresh: boolean) => {
        const entry = checks.get(accountId) ?? checks.get(DEFAULT_CLAUDE_ACCOUNT)
        if (entry === undefined) return Effect.die("the default Claude account has no check")
        return refresh ? Effect.andThen(entry.invalidate, entry.cached) : entry.cached
      }

      const describe = (
        row: { readonly id: string; readonly name: string },
        active: string,
        refresh: boolean,
      ) =>
        Effect.map(statusOf(row.id, refresh), (status): ClaudeAccount => ({
          id: row.id,
          name: row.name,
          isDefault: row.id === DEFAULT_CLAUDE_ACCOUNT,
          active: row.id === active,
          status,
        }))

      const accounts = ({ refresh }: { readonly refresh: boolean }) =>
        Effect.gen(function* () {
          const rows = [{ id: DEFAULT_CLAUDE_ACCOUNT, name: DEFAULT_NAME }, ...(yield* added)]
          const active = yield* activeId
          return yield* Effect.forEach(rows, (row) => describe(row, active, refresh), {
            concurrency: "unbounded",
          })
        }).pipe(Effect.withSpan("ClaudeAccountService.accounts"))

      const add = Effect.fn("ClaudeAccountService.add")(function* (requested: string) {
        const name = requested.trim()
        if (name === "") {
          return yield* new ClaudeAccountNameInvalid({ reason: "Give the account a name." })
        }
        if (name.length > MAX_NAME_LENGTH) {
          return yield* new ClaudeAccountNameInvalid({
            reason: `Keep the name under ${MAX_NAME_LENGTH} characters.`,
          })
        }
        const id = randomUUID()
        const createdAt = DateTime.formatIso(yield* DateTime.now)
        yield* fs.makeDirectory(dirOf(id), { recursive: true }).pipe(Effect.orDie)
        yield* sql`
          INSERT INTO claude_accounts ${sql.insert({ id, name, created_at: createdAt })}
        `.pipe(Effect.orDie)
        checks.set(id, yield* makeCheck(dirOf(id)))
        return yield* describe({ id, name }, yield* activeId, false)
      })

      const remove = Effect.fn("ClaudeAccountService.remove")(function* (accountId: string) {
        if (accountId === DEFAULT_CLAUDE_ACCOUNT || !checks.has(accountId)) {
          return yield* new ClaudeAccountNotFound({ accountId })
        }
        const open = (yield* countOpenSessions(accountId).pipe(Effect.orDie))[0]?.count ?? 0
        if (open > 0) return yield* new ClaudeAccountInUse({ accountId, sessions: open })

        yield* sql`DELETE FROM claude_accounts WHERE id = ${accountId}`.pipe(Effect.orDie)
        checks.delete(accountId)
        const dir = dirOf(accountId)
        // Only ever a folder Humanity created for this account.
        if (isInsideDir(config.accountsDir, dir)) {
          yield* fs.remove(dir, { recursive: true, force: true }).pipe(
            Effect.catch((error) =>
              Effect.logWarning("could not remove the account's config folder", {
                dir,
                error: String(error),
              }),
            ),
          )
        }
      })

      const setActive = Effect.fn("ClaudeAccountService.setActive")(function* (accountId: string) {
        if (!checks.has(accountId)) return yield* new ClaudeAccountNotFound({ accountId })
        const json = JSON.stringify(accountId)
        yield* sql`
          INSERT INTO preferences (key, value_json) VALUES (${ACTIVE_ACCOUNT_KEY}, ${json})
          ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json
        `.pipe(Effect.orDie)
      })

      return {
        status: ({ refresh }) => Effect.flatMap(activeId, (id) => statusOf(id, refresh)),
        accounts,
        add,
        remove,
        setActive,
        activeId,
        configDirFor: (accountId) =>
          Effect.sync(() =>
            accountId === null || accountId === DEFAULT_CLAUDE_ACCOUNT || !checks.has(accountId)
              ? undefined
              : dirOf(accountId),
          ),
      }
    }),
  )
}
