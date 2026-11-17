import {
  AccountFolderInvalid,
  AccountInUse,
  AccountNameInvalid,
  AccountNotFound,
  type AgentProvider,
  DEFAULT_ACCOUNT,
} from "@humanity/contracts"
import { DateTime, Duration, Effect, Exit, FileSystem, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { expandHome, isInsideDir, isSamePath } from "../paths.ts"
import { ServerConfig } from "../ServerConfig.ts"

const CONNECTED_TTL = Duration.minutes(5)
const OTHER_TTL = Duration.seconds(10)

const DEFAULT_NAME = "Default login"
const MAX_NAME_LENGTH = 60

const AccountRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  config_dir: Schema.NullOr(Schema.String),
})
type AccountRow = typeof AccountRow.Type
const ActiveRow = Schema.Struct({ value_json: Schema.fromJsonString(Schema.String) })
const CountRow = Schema.Struct({ count: Schema.Number })

interface StatusLike {
  readonly connection: { readonly _tag: string }
}

export interface RegisteredAccount<Status> {
  readonly id: string
  readonly name: string
  readonly isDefault: boolean
  readonly linkedFolder: boolean
  readonly active: boolean
  readonly status: Status
}

export interface AccountRegistry<Status> {
  readonly status: (options: { readonly refresh: boolean }) => Effect.Effect<Status>
  readonly accounts: (options: {
    readonly refresh: boolean
  }) => Effect.Effect<ReadonlyArray<RegisteredAccount<Status>>>
  readonly add: (
    name: string,
    configDir?: string,
  ) => Effect.Effect<RegisteredAccount<Status>, AccountNameInvalid | AccountFolderInvalid>
  readonly remove: (accountId: string) => Effect.Effect<void, AccountNotFound | AccountInUse>
  readonly setActive: (accountId: string) => Effect.Effect<void, AccountNotFound>
  readonly activeId: Effect.Effect<string>
  readonly configDirFor: (accountId: string | null) => Effect.Effect<string | undefined>
}

export interface AccountRegistryOptions<Status> {
  readonly provider: AgentProvider
  readonly table: "claude_accounts" | "codex_accounts" | "kiro_accounts"
  readonly activeKey: string
  readonly accountsDir: string
  readonly defaultDir: string
  readonly product: string
  readonly folderExample: string
  readonly check: (configDir: string | undefined) => Effect.Effect<Status>
}

interface StatusCheck<Status> {
  readonly cached: Effect.Effect<Status>
  readonly invalidate: Effect.Effect<void>
}

interface AccountFolder {
  readonly dir: string
  readonly linked: boolean
}

export const makeAccountRegistry = <Status extends StatusLike>(
  options: AccountRegistryOptions<Status>,
): Effect.Effect<
  AccountRegistry<Status>,
  never,
  ServerConfig | FileSystem.FileSystem | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const config = yield* ServerConfig
    const fs = yield* FileSystem.FileSystem
    const sql = yield* SqlClient.SqlClient
    const { provider, product } = options
    const table = sql(options.table)

    const ownDirOf = (accountId: string) => join(options.accountsDir, accountId)
    const folderOf = (row: AccountRow): AccountFolder =>
      row.config_dir === null
        ? { dir: ownDirOf(row.id), linked: false }
        : { dir: row.config_dir, linked: true }

    const makeCheck = (configDir: string | undefined) =>
      Effect.map(
        Effect.cachedInvalidateWithTTL(options.check(configDir), (exit) =>
          Exit.isSuccess(exit) && exit.value.connection._tag === "Connected"
            ? CONNECTED_TTL
            : OTHER_TTL,
        ),
        ([cached, invalidate]): StatusCheck<Status> => ({ cached, invalidate }),
      )

    const selectAccounts = SqlSchema.findAll({
      Request: Schema.Void,
      Result: AccountRow,
      execute: () => sql`SELECT id, name, config_dir FROM ${table} ORDER BY created_at, rowid`,
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
        sql`SELECT COUNT(*) AS count FROM sessions WHERE account_id = ${accountId} AND provider = ${provider} AND status != 'ended'`,
    })

    const added = selectAccounts(undefined).pipe(Effect.orDie)

    const checks = new Map<string, StatusCheck<Status>>()
    const folders = new Map<string, AccountFolder>()
    checks.set(DEFAULT_ACCOUNT, yield* makeCheck(undefined))
    for (const row of yield* added) {
      const folder = folderOf(row)
      folders.set(row.id, folder)
      checks.set(row.id, yield* makeCheck(folder.dir))
    }

    const activeId = Effect.gen(function* () {
      const stored = yield* selectActive(options.activeKey).pipe(
        Effect.catch(() => Effect.succeedNone),
      )
      return stored.pipe(
        Effect.fromOption,
        Effect.map((row) => row.value_json),
        Effect.filterOrFail((id) => checks.has(id)),
        Effect.orElseSucceed(() => DEFAULT_ACCOUNT),
      )
    }).pipe(Effect.flatten)

    const statusOf = (accountId: string, refresh: boolean): Effect.Effect<Status> => {
      const entry = checks.get(accountId) ?? checks.get(DEFAULT_ACCOUNT)
      if (entry === undefined) return Effect.die(`the default ${product} account has no check`)
      return refresh ? Effect.andThen(entry.invalidate, entry.cached) : entry.cached
    }

    const describe = (
      row: { readonly id: string; readonly name: string },
      active: string,
      refresh: boolean,
    ) =>
      Effect.map(statusOf(row.id, refresh), (status): RegisteredAccount<Status> => ({
        id: row.id,
        name: row.name,
        isDefault: row.id === DEFAULT_ACCOUNT,
        linkedFolder: folders.get(row.id)?.linked ?? false,
        active: row.id === active,
        status,
      }))

    const accounts = ({ refresh }: { readonly refresh: boolean }) =>
      Effect.gen(function* () {
        const rows = [{ id: DEFAULT_ACCOUNT, name: DEFAULT_NAME }, ...(yield* added)]
        const active = yield* activeId
        return yield* Effect.forEach(rows, (row) => describe(row, active, refresh), {
          concurrency: "unbounded",
        })
      }).pipe(Effect.withSpan("AccountRegistry.accounts", { attributes: { provider } }))

    const linkableFolder = Effect.fn("AccountRegistry.linkableFolder")(function* (
      requested: string,
    ) {
      const given = requested.trim()
      const invalid = (reason: string) =>
        Effect.fail(new AccountFolderInvalid({ folder: given, reason }))
      if (given === "") return yield* invalid("Give the path of the folder.")
      const expanded = expandHome(given, homedir())
      if (!isAbsolute(expanded)) {
        return yield* invalid(
          `Give the full path of the folder, like ~/${options.folderExample} or C:\\Users\\you\\${options.folderExample}.`,
        )
      }
      const dir = resolve(expanded)
      if (isSamePath(dir, config.home) || isInsideDir(config.home, dir)) {
        return yield* invalid(
          `That folder is inside Humanity's data directory. Pick a ${product} folder of your own.`,
        )
      }
      if (isSamePath(dir, options.defaultDir)) {
        return yield* invalid("That folder is the default login's already. Pick another one.")
      }
      for (const row of yield* added) {
        if (isSamePath(dir, folderOf(row).dir)) {
          return yield* invalid(`That folder is the account “${row.name}” already.`)
        }
      }
      const info = yield* Effect.option(fs.stat(dir))
      if (Option.isNone(info)) return yield* invalid(`There is no folder at ${dir}.`)
      if (info.value.type !== "Directory") return yield* invalid(`${dir} is a file, not a folder.`)
      return dir
    })

    const add = Effect.fn("AccountRegistry.add")(function* (requested: string, configDir?: string) {
      const name = requested.trim()
      if (name === "") {
        return yield* new AccountNameInvalid({ reason: "Give the account a name." })
      }
      if (name.length > MAX_NAME_LENGTH) {
        return yield* new AccountNameInvalid({
          reason: `Keep the name under ${MAX_NAME_LENGTH} characters.`,
        })
      }
      const id = randomUUID()
      const linked = configDir === undefined ? null : yield* linkableFolder(configDir)
      const createdAt = DateTime.formatIso(yield* DateTime.now)
      if (linked === null) {
        yield* fs.makeDirectory(ownDirOf(id), { recursive: true }).pipe(Effect.orDie)
      }
      yield* sql`
        INSERT INTO ${table} ${sql.insert({ id, name, config_dir: linked, created_at: createdAt })}
      `.pipe(Effect.orDie)
      const folder = folderOf({ id, name, config_dir: linked })
      folders.set(id, folder)
      checks.set(id, yield* makeCheck(folder.dir))
      return yield* describe({ id, name }, yield* activeId, false)
    })

    const remove = Effect.fn("AccountRegistry.remove")(function* (accountId: string) {
      if (accountId === DEFAULT_ACCOUNT || !checks.has(accountId)) {
        return yield* new AccountNotFound({ accountId })
      }
      const open = (yield* countOpenSessions(accountId).pipe(Effect.orDie))[0]?.count ?? 0
      if (open > 0) return yield* new AccountInUse({ accountId, sessions: open })

      yield* sql`DELETE FROM ${table} WHERE id = ${accountId}`.pipe(Effect.orDie)
      checks.delete(accountId)
      const folder = folders.get(accountId)
      folders.delete(accountId)
      const dir = ownDirOf(accountId)
      if (folder?.linked !== true && isInsideDir(options.accountsDir, dir)) {
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

    const setActive = Effect.fn("AccountRegistry.setActive")(function* (accountId: string) {
      if (!checks.has(accountId)) return yield* new AccountNotFound({ accountId })
      const json = JSON.stringify(accountId)
      yield* sql`
        INSERT INTO preferences (key, value_json) VALUES (${options.activeKey}, ${json})
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
        Effect.sync(() => (accountId === null ? undefined : folders.get(accountId)?.dir)),
    }
  })
