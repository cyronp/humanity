import {
  localUrls,
  type ProjectId,
  type ProjectNotFound,
  SessionEnded,
  type SessionId,
  SessionNotFound,
  type ShellInfo,
  type TerminalAttachEvent,
  TerminalId,
  type TerminalInfo,
  TerminalNotFound,
  type TerminalOpener,
  TerminalOwner,
  terminalOwnerKey,
  TerminalSpawnFailed,
} from "@humanity/contracts"
import {
  type Cause,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  PubSub,
  Queue,
  Schema,
  Stream,
} from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { LocateOptions } from "../agent/installedCli.ts"
import { SessionRepo } from "../db/SessionRepo.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { PreferencesService } from "../services/PreferencesService.ts"
import { ProjectService } from "../services/ProjectService.ts"
import { terminalEnvironment } from "./environment.ts"
import { INTEGRATION_FILES, shellLaunch } from "./integration.ts"
import { folderFromOsc7, isInsideFolder, parseCommandMark } from "./osc.ts"
import { PtyHost, type PtyProcess } from "./PtyHost.ts"
import { makeScreen, type Marker, restartMarker, type Screen } from "./screen.ts"
import { detectShells, pickShell, type Shell, shellLocateOptions } from "./shells.ts"

export const DEFAULT_COLS = 120
export const DEFAULT_ROWS = 30

const FLUSH_MS = 8
const FLUSH_CHARS = 16_384
export const ATTACH_WINDOW = 512 * 1024

const SAVE_INTERVAL = "5 seconds"

const EXIT_WAIT = "5 seconds"

const COMMANDS_KEPT = 200
const URLS_KEPT = 5
const URL_CARRY = 4_096
const CWD_SAVE_MS = 1_000

export interface CommandSpan {
  readonly ordinal: number
  readonly start: Marker
  end: Marker | undefined
  exitCode: number | null
  done: boolean
}

type Patch = { -readonly [Key in keyof TerminalInfo]?: TerminalInfo[Key] }

const CURSORS_KEPT = 64
const WAIT_POLL = "100 millis"

interface Cursor {
  readonly marker: Marker
  readonly commands: number
}

export interface AgentRead {
  readonly text: string
  readonly cursor: string
  readonly dropped: boolean
  readonly truncated: boolean
}

export type WaitFor =
  | { readonly _tag: "command" }
  | { readonly _tag: "pattern"; readonly pattern: RegExp }
  | { readonly _tag: "quiet"; readonly quietMs: number }

export interface AgentWait extends AgentRead {
  readonly outcome: "command" | "pattern" | "quiet" | "timeout" | "exited" | "unsupported"
  readonly exitCode: number | null
}

const TerminalRow = Schema.Struct({
  id: Schema.String,
  session_id: Schema.NullOr(Schema.String),
  project_id: Schema.NullOr(Schema.String),
  ordinal: Schema.Number,
  title: Schema.NullOr(Schema.String),
  opener: Schema.Literals(["human", "agent"]),
  shell: Schema.String,
  cwd: Schema.String,
  created_at: Schema.String,
})
type TerminalRow = typeof TerminalRow.Type

interface Attachment {
  readonly id: string
  readonly queue: Queue.Queue<TerminalAttachEvent, Cause.Done>
  sent: number
  acked: number
  stale: boolean
}

interface Live {
  info: TerminalInfo
  readonly screen: Screen
  pty: PtyProcess | undefined
  exited: Promise<void>
  generation: number
  seq: number
  parsed: number
  readonly tail: Array<{ readonly data: string; readonly end: number }>
  pending: string
  pendingFrom: number
  flushTimer: ReturnType<typeof setTimeout> | undefined
  readonly attachments: Map<string, Attachment>
  dirty: boolean
  readonly scrollback: number
  folder: string
  readonly commands: Array<CommandSpan>
  commandsStarted: number
  readonly cursors: Map<string, Cursor>
  nextCursor: number
  cwdTimer: ReturnType<typeof setTimeout> | undefined
  urlCarry: string
}

export interface OpenTerminalOptions {
  readonly opener: TerminalOpener
  readonly shell?: string | null | undefined
  readonly title?: string | null | undefined
  readonly cols?: number | undefined
  readonly rows?: number | undefined
}

type OwnerNotFound = SessionNotFound | ProjectNotFound

const ownerOfRow = (row: TerminalRow): TerminalOwner =>
  row.session_id !== null
    ? { _tag: "Session", sessionId: row.session_id as SessionId }
    : row.project_id !== null
      ? { _tag: "Project", projectId: row.project_id as ProjectId }
      : { _tag: "Home" }

export class TerminalService extends Context.Service<
  TerminalService,
  {
    readonly list: (
      owner: TerminalOwner,
    ) => Effect.Effect<ReadonlyArray<TerminalInfo>, OwnerNotFound>
    readonly watch: (
      owner: TerminalOwner,
    ) => Stream.Stream<ReadonlyArray<TerminalInfo>, OwnerNotFound>
    readonly open: (
      owner: TerminalOwner,
      options: OpenTerminalOptions,
    ) => Effect.Effect<TerminalInfo, OwnerNotFound | SessionEnded | TerminalSpawnFailed>
    readonly close: (terminalId: string) => Effect.Effect<void, TerminalNotFound>
    readonly rename: (
      terminalId: string,
      title: string | null,
    ) => Effect.Effect<TerminalInfo, TerminalNotFound>
    readonly restart: (
      terminalId: string,
    ) => Effect.Effect<TerminalInfo, TerminalNotFound | TerminalSpawnFailed>
    readonly attach: (
      terminalId: string,
      attachmentId: string,
      size: { readonly cols: number; readonly rows: number },
    ) => Stream.Stream<TerminalAttachEvent, TerminalNotFound | TerminalSpawnFailed>
    readonly write: (terminalId: string, data: string) => Effect.Effect<void, TerminalNotFound>
    readonly resize: (
      terminalId: string,
      cols: number,
      rows: number,
    ) => Effect.Effect<void, TerminalNotFound>
    readonly ack: (terminalId: string, attachmentId: string, seq: number) => Effect.Effect<void>
    readonly shells: Effect.Effect<ReadonlyArray<ShellInfo>>
    readonly closeOwner: (owner: TerminalOwner) => Effect.Effect<void>
    readonly moveSession: (sessionId: SessionId, folder: string) => Effect.Effect<void>
    /** The process id of each running terminal's shell. */
    readonly processIds: Effect.Effect<ReadonlyMap<number, TerminalId>>

    readonly info: (terminalId: string) => Effect.Effect<TerminalInfo, TerminalNotFound>
    readonly agentCursor: (
      terminalId: string,
    ) => Effect.Effect<string, TerminalNotFound | TerminalSpawnFailed>
    readonly agentRead: (
      terminalId: string,
      options: {
        readonly view: "output" | "screen"
        readonly since: string | undefined
        readonly maxLines: number
      },
    ) => Effect.Effect<AgentRead, TerminalNotFound | TerminalSpawnFailed>
    readonly agentWrite: (
      terminalId: string,
      data: string,
    ) => Effect.Effect<void, TerminalNotFound | TerminalSpawnFailed>
    readonly agentWait: (
      terminalId: string,
      options: {
        readonly for: WaitFor
        readonly since: string | undefined
        readonly timeoutMs: number
        readonly maxLines: number
      },
    ) => Effect.Effect<AgentWait, TerminalNotFound | TerminalSpawnFailed>
  }
>()("humanity/TerminalService") {
  static readonly layer = (locate: () => LocateOptions = shellLocateOptions) =>
    Layer.effect(
      TerminalService,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const fs = yield* FileSystem.FileSystem
        const config = yield* ServerConfig
        const repo = yield* SessionRepo
        const preferences = yield* PreferencesService
        const projects = yield* ProjectService
        const host = yield* PtyHost

        const lives = new Map<string, Live>()
        const loadedOwners = new Set<string>()
        const changes = yield* PubSub.unbounded<string>()

        const folderOf = (ownerKey: string) => join(config.terminalsDir, ownerKey)
        const snapshotPath = (info: Pick<TerminalInfo, "owner" | "id">) =>
          join(folderOf(terminalOwnerKey(info.owner)), `${info.id}.snap`)

        const rowsOf = SqlSchema.findAll({
          Request: TerminalOwner,
          Result: TerminalRow,
          execute: (owner) => {
            switch (owner._tag) {
              case "Session":
                return sql`
                  SELECT * FROM terminals WHERE session_id = ${owner.sessionId} ORDER BY ordinal
                `
              case "Project":
                return sql`
                  SELECT * FROM terminals WHERE project_id = ${owner.projectId} ORDER BY ordinal
                `
              case "Home":
                return sql`
                  SELECT * FROM terminals WHERE session_id IS NULL AND project_id IS NULL
                  ORDER BY ordinal
                `
            }
          },
        })

        const shellsNow = (): ReadonlyArray<Shell> => detectShells(locate())

        const changed = (owner: TerminalOwner) =>
          void PubSub.publishUnsafe(changes, terminalOwnerKey(owner))

        const update = (live: Live, patch: Partial<TerminalInfo>) => {
          live.info = { ...live.info, ...patch }
          changed(live.info.owner)
        }

        const updateIfChanged = (live: Live, patch: Patch) => {
          const keys = Object.keys(patch) as Array<keyof TerminalInfo>
          if (keys.some((key) => live.info[key] !== patch[key])) update(live, patch)
        }

        const writeIntegration = Effect.forEach(
          Object.entries(INTEGRATION_FILES),
          ([name, text]) =>
            Effect.gen(function* () {
              const path = join(config.shellIntegrationDir, name)
              const current = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ""))
              if (current === text) return
              yield* fs.makeDirectory(dirname(path), { recursive: true })
              yield* fs.writeFileString(path, text)
            }),
          { discard: true },
        ).pipe(
          Effect.catch((error) =>
            Effect.logWarning("Could not write the shell integration scripts", error.message),
          ),
        )
        yield* writeIntegration

        const saveCwd = (live: Live) => {
          clearTimeout(live.cwdTimer)
          live.cwdTimer = setTimeout(() => {
            live.cwdTimer = undefined
            const { id, cwd } = live.info
            Effect.runFork(
              sql`UPDATE terminals SET cwd = ${cwd} WHERE id = ${id}`.pipe(Effect.ignore),
            )
          }, CWD_SAVE_MS)
        }

        const onCommandMark = (live: Live, data: string) => {
          const mark = parseCommandMark(data)
          if (mark === undefined) return
          const patch: Patch = { integration: true }
          switch (mark._tag) {
            case "PromptStart":
              patch.busy = false
              break
            case "CommandStart": {
              patch.busy = true
              const start = live.screen.marker()
              live.commandsStarted++
              if (start !== undefined) {
                live.commands.push({
                  ordinal: live.commandsStarted,
                  start,
                  end: undefined,
                  exitCode: null,
                  done: false,
                })
              }
              while (live.commands.length > COMMANDS_KEPT) live.commands.shift()?.start.dispose()
              break
            }
            case "CommandEnd": {
              patch.busy = false
              patch.lastExitCode = mark.exitCode
              const last = live.commands.at(-1)
              if (last !== undefined && !last.done) {
                last.done = true
                last.exitCode = mark.exitCode
                last.end = live.screen.marker()
              }
              break
            }
          }
          updateIfChanged(live, patch)
        }

        const onFolderMark = (live: Live, data: string) => {
          const cwd = folderFromOsc7(data, process.platform)
          if (cwd === undefined || cwd === live.info.cwd) return
          const patch: Patch = { cwd }
          if (
            live.info.location === "checkout" &&
            isInsideFolder(live.folder, cwd, process.platform)
          ) {
            patch.location = "folder"
          }
          update(live, patch)
          saveCwd(live)
        }

        const isOwnedBy = (live: Live, ownerKey: string) =>
          terminalOwnerKey(live.info.owner) === ownerKey

        const placeOf = (
          owner: TerminalOwner,
        ): Effect.Effect<{ readonly folder: string; readonly ended: boolean }, OwnerNotFound> => {
          switch (owner._tag) {
            case "Session":
              return Effect.flatMap(repo.get(owner.sessionId), (found) =>
                Option.match(found, {
                  onNone: () => Effect.fail(new SessionNotFound({ sessionId: owner.sessionId })),
                  onSome: (session) =>
                    Effect.succeed({
                      folder: session.worktreePath,
                      ended: session.status === "ended",
                    }),
                }),
              )
            case "Project":
              return Effect.map(projects.get(owner.projectId), (project) => ({
                folder: project.localPath,
                ended: false,
              }))
            case "Home":
              return Effect.sync(() => ({ folder: homedir(), ended: false }))
          }
        }

        const offer = (attachment: Attachment, event: TerminalAttachEvent) =>
          void Queue.offerUnsafe(attachment.queue, event)

        const sendSnapshot = (live: Live, attachment: Attachment) => {
          offer(attachment, {
            _tag: "Snapshot",
            data: live.screen.serialize(),
            seq: live.parsed,
            cols: live.screen.cols(),
            rows: live.screen.rows(),
          })
          if (live.tail.length > 0) {
            offer(attachment, {
              _tag: "Output",
              data: live.tail.map((chunk) => chunk.data).join(""),
              seq: live.seq,
            })
          }
          attachment.sent = live.seq
          attachment.stale = false
        }

        const flush = (live: Live) => {
          if (live.flushTimer !== undefined) {
            clearTimeout(live.flushTimer)
            live.flushTimer = undefined
          }
          if (live.pending === "") return
          for (const attachment of live.attachments.values()) {
            if (attachment.stale || attachment.sent >= live.seq) continue
            if (attachment.sent - attachment.acked > ATTACH_WINDOW) {
              attachment.stale = true
              continue
            }
            const from = Math.max(0, attachment.sent - live.pendingFrom)
            offer(attachment, { _tag: "Output", data: live.pending.slice(from), seq: live.seq })
            attachment.sent = live.seq
          }
          live.pending = ""
          live.pendingFrom = live.seq
        }

        const feed = (live: Live, data: string) => {
          if (data === "") return
          live.seq += data.length
          const end = live.seq
          live.tail.push({ data, end })
          live.screen.write(data, () => {
            live.parsed = end
            while (live.tail.length > 0 && (live.tail[0]?.end ?? Infinity) <= end) live.tail.shift()
          })
          live.pending += data
          live.dirty = true
          if (live.pending.length >= FLUSH_CHARS) flush(live)
          else live.flushTimer ??= setTimeout(() => flush(live), FLUSH_MS)
        }

        const scanUrls = (live: Live, data: string) => {
          const found = scanLocalUrls(live.urlCarry, data)
          live.urlCarry = found.carry
          if (found.urls.length === 0) return
          const seenAt = new Date().toISOString()
          const urls = [
            ...live.info.urls.filter((offer) => !found.urls.includes(offer.url)),
            ...found.urls.map((url) => ({ url, seenAt })),
          ].slice(-URLS_KEPT)
          update(live, { urls })
        }

        const killProcess = (live: Live) => {
          live.generation++
          live.pty?.kill()
          live.pty = undefined
        }

        const stopProcess = (live: Live) =>
          Effect.suspend(() => {
            const exited = live.exited
            killProcess(live)
            return Effect.promise(() => exited).pipe(Effect.timeout(EXIT_WAIT), Effect.ignore)
          })

        const startProcess = (live: Live, fallbackFolder: string) =>
          Effect.gen(function* () {
            const shells = shellsNow()
            const shell = pickShell(shells, live.info.shell)
            if (shell === undefined) {
              return yield* new TerminalSpawnFailed({
                shell: live.info.shellName,
                reason: "no shell was found on this machine.",
              })
            }
            const cwdExists = yield* fs
              .exists(live.info.cwd)
              .pipe(Effect.orElseSucceed(() => false))
            const cwd = cwdExists ? live.info.cwd : fallbackFolder
            if (process.platform === "win32" && live.seq > 0) {
              feed(live, `${"\r\n".repeat(live.screen.rows())}\x1b[H`)
            }
            const generation = ++live.generation
            const launch = shellLaunch(shell, {
              platform: process.platform,
              folder: config.shellIntegrationDir,
              env: process.env,
            })
            const pty = yield* host
              .spawn({
                file: shell.path,
                args: launch.args,
                cwd,
                env: { ...terminalEnvironment(process.env, process.platform), ...launch.env },
                cols: live.screen.cols(),
                rows: live.screen.rows(),
              })
              .pipe(
                Effect.mapError(
                  (error) => new TerminalSpawnFailed({ shell: shell.name, reason: error.reason }),
                ),
              )
            live.pty = pty
            live.urlCarry = ""
            live.exited = new Promise((resolve) => pty.onExit(() => resolve()))
            pty.onData((data) => {
              if (live.generation !== generation) return
              feed(live, data)
              scanUrls(live, data)
            })
            pty.onExit((exitCode) => {
              if (live.generation !== generation) return
              live.pty = undefined
              flush(live)
              update(live, { state: "exited", exitCode, busy: null })
              for (const attachment of live.attachments.values()) {
                offer(attachment, { _tag: "Exited", exitCode })
              }
            })
            update(live, {
              state: "running",
              exitCode: null,
              busy: null,
              lastExitCode: null,
              integration: false,
              urls: [],
              shell: shell.id,
              shellName: shell.name,
              cwd,
            })
          })

        const makeLive = (
          info: TerminalInfo,
          options: {
            readonly scrollback: number
            readonly cols: number
            readonly rows: number
            readonly folder: string
          },
        ): Live => {
          const live: Live = {
            info,
            screen: makeScreen(options),
            pty: undefined,
            exited: Promise.resolve(),
            generation: 0,
            seq: 0,
            parsed: 0,
            tail: [],
            pending: "",
            pendingFrom: 0,
            flushTimer: undefined,
            attachments: new Map(),
            dirty: false,
            scrollback: options.scrollback,
            folder: options.folder,
            commands: [],
            commandsStarted: 0,
            cursors: new Map(),
            nextCursor: 0,
            cwdTimer: undefined,
            urlCarry: "",
          }
          live.screen.onReply((reply) => live.pty?.write(reply))
          live.screen.onOsc(133, (data) => onCommandMark(live, data))
          live.screen.onOsc(7, (data) => onFolderMark(live, data))
          return live
        }

        const save = (live: Live) =>
          Effect.gen(function* () {
            if (!live.dirty) return
            live.dirty = false
            const path = snapshotPath(live.info)
            const temporary = `${path}.${process.pid}.tmp`
            yield* fs.makeDirectory(folderOf(terminalOwnerKey(live.info.owner)), {
              recursive: true,
            })
            yield* fs.writeFileString(temporary, live.screen.serialize())
            yield* fs.rename(temporary, path)
          }).pipe(
            Effect.catch((error) =>
              Effect.logWarning(`Could not save terminal ${live.info.id}`, error.message),
            ),
          )

        const saveAll = Effect.suspend(() =>
          Effect.forEach([...lives.values()], save, { discard: true }),
        )

        const readSnapshot = (info: TerminalInfo) =>
          fs.readFileString(snapshotPath(info)).pipe(Effect.orElseSucceed(() => ""))

        const ensureLoaded = (owner: TerminalOwner) =>
          Effect.gen(function* () {
            const key = terminalOwnerKey(owner)
            if (loadedOwners.has(key)) return
            loadedOwners.add(key)
            const rows = yield* rowsOf(owner).pipe(Effect.orDie)
            if (rows.length === 0) return
            const { scrollback } = yield* preferences.terminal
            const shells = shellsNow()
            const place = yield* Effect.option(placeOf(owner))
            for (const row of rows) {
              if (lives.has(row.id)) continue
              const info = infoOf(row, shells)
              const live = makeLive(info, {
                scrollback,
                cols: DEFAULT_COLS,
                rows: DEFAULT_ROWS,
                folder: Option.match(place, { onNone: () => row.cwd, onSome: (p) => p.folder }),
              })
              const saved = yield* readSnapshot(info)
              feed(live, saved)
              feed(live, restartMarker(new Date(), "Humanity restarted; this is a new shell"))
              live.dirty = false
              lives.set(row.id, live)
            }
          })

        const infoOf = (row: TerminalRow, shells: ReadonlyArray<Shell>): TerminalInfo => ({
          id: TerminalId.make(row.id),
          owner: ownerOfRow(row),
          ordinal: row.ordinal,
          title: row.title,
          opener: row.opener,
          shell: row.shell,
          shellName: shells.find((shell) => shell.id === row.shell)?.name ?? row.shell,
          cwd: row.cwd,
          location: "folder",
          state: "restored",
          exitCode: null,
          busy: null,
          lastExitCode: null,
          integration: false,
          urls: [],
          createdAt: row.created_at,
        })

        const remove = (live: Live) =>
          Effect.gen(function* () {
            yield* stopProcess(live)
            flush(live)
            clearTimeout(live.cwdTimer)
            for (const attachment of live.attachments.values()) Queue.endUnsafe(attachment.queue)
            live.attachments.clear()
            live.screen.dispose()
            lives.delete(live.info.id)
            yield* sql`DELETE FROM terminals WHERE id = ${live.info.id}`.pipe(Effect.orDie)
            yield* fs.remove(snapshotPath(live.info), { force: true }).pipe(Effect.ignore)
            changed(live.info.owner)
          })

        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            yield* Effect.forEach([...lives.values()], stopProcess, {
              concurrency: "unbounded",
              discard: true,
            })
            for (const live of lives.values()) {
              flush(live)
              for (const attachment of live.attachments.values()) Queue.endUnsafe(attachment.queue)
            }
            yield* saveAll
            for (const live of lives.values()) live.screen.dispose()
            yield* PubSub.shutdown(changes)
          }),
        )

        yield* saveAll.pipe(
          Effect.andThen(Effect.sleep(SAVE_INTERVAL)),
          Effect.forever,
          Effect.forkScoped,
        )

        const find = (terminalId: string) =>
          Effect.suspend(() => {
            const live = lives.get(terminalId)
            return live === undefined
              ? Effect.fail(new TerminalNotFound({ terminalId }))
              : Effect.succeed(live)
          })

        const list = (owner: TerminalOwner) =>
          Effect.gen(function* () {
            yield* placeOf(owner)
            yield* ensureLoaded(owner)
            const key = terminalOwnerKey(owner)
            return [...lives.values()]
              .filter((live) => isOwnedBy(live, key))
              .map((live) => live.info)
              .sort((a, b) => a.ordinal - b.ordinal)
          })

        const watch = (owner: TerminalOwner) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const subscription = yield* PubSub.subscribe(changes)
              const first = yield* list(owner)
              const key = terminalOwnerKey(owner)
              return Stream.concat(
                Stream.make(first),
                Stream.fromSubscription(subscription).pipe(
                  Stream.filter((changedOwner) => changedOwner === key),
                  Stream.mapEffect(() => list(owner)),
                ),
              )
            }),
          )

        const open = Effect.fn("TerminalService.open")(function* (
          owner: TerminalOwner,
          options: OpenTerminalOptions,
        ) {
          const place = yield* placeOf(owner)
          if (place.ended && owner._tag === "Session") {
            return yield* new SessionEnded({ sessionId: owner.sessionId })
          }
          yield* ensureLoaded(owner)
          const key = terminalOwnerKey(owner)
          const preferred = yield* preferences.terminal
          const shells = shellsNow()
          const shell = pickShell(shells, options.shell ?? preferred.shell)
          if (shell === undefined) {
            return yield* new TerminalSpawnFailed({
              shell: "A shell",
              reason: "no shell was found on this machine.",
            })
          }
          const ordinal =
            Math.max(
              0,
              ...[...lives.values()]
                .filter((live) => isOwnedBy(live, key))
                .map((live) => live.info.ordinal),
            ) + 1
          const info: TerminalInfo = {
            id: TerminalId.make(randomUUID()),
            owner,
            ordinal,
            title: options.title ?? null,
            opener: options.opener,
            shell: shell.id,
            shellName: shell.name,
            cwd: place.folder,
            location: "folder",
            state: "starting",
            exitCode: null,
            busy: null,
            lastExitCode: null,
            integration: false,
            urls: [],
            createdAt: DateTime.formatIso(yield* DateTime.now),
          }
          const live = makeLive(info, {
            scrollback: preferred.scrollback,
            cols: options.cols ?? DEFAULT_COLS,
            rows: options.rows ?? DEFAULT_ROWS,
            folder: place.folder,
          })
          yield* startProcess(live, place.folder).pipe(
            Effect.tapError(() => Effect.sync(() => live.screen.dispose())),
          )
          lives.set(info.id, live)
          yield* sql`
            INSERT INTO terminals
              (id, session_id, project_id, ordinal, title, opener, shell, cwd, created_at)
            VALUES (${info.id}, ${owner._tag === "Session" ? owner.sessionId : null},
              ${owner._tag === "Project" ? owner.projectId : null}, ${info.ordinal},
              ${info.title}, ${info.opener}, ${live.info.shell}, ${live.info.cwd},
              ${info.createdAt})
          `.pipe(Effect.orDie)
          changed(owner)
          return live.info
        })

        const close = (terminalId: string) => Effect.flatMap(find(terminalId), remove)

        const rename = (terminalId: string, title: string | null) =>
          Effect.gen(function* () {
            const live = yield* find(terminalId)
            const trimmed = title?.trim() ?? ""
            const next = trimmed === "" ? null : trimmed
            yield* sql`UPDATE terminals SET title = ${next} WHERE id = ${terminalId}`.pipe(
              Effect.orDie,
            )
            update(live, { title: next })
            return live.info
          })

        const folderFor = (live: Live) =>
          Effect.map(Effect.option(placeOf(live.info.owner)), (place) =>
            Option.match(place, { onNone: () => live.info.cwd, onSome: ({ folder }) => folder }),
          )

        const restart = (terminalId: string) =>
          Effect.gen(function* () {
            const live = yield* find(terminalId)
            yield* stopProcess(live)
            feed(live, restartMarker(new Date(), "Restarted"))
            yield* startProcess(live, yield* folderFor(live))
            return live.info
          })

        const resizeLive = (live: Live, cols: number, rows: number) => {
          if (cols < 2 || rows < 1) return
          if (cols === live.screen.cols() && rows === live.screen.rows()) return
          live.screen.resize(cols, rows)
          live.pty?.resize(cols, rows)
        }

        const attach = (
          terminalId: string,
          attachmentId: string,
          size: { readonly cols: number; readonly rows: number },
        ) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const live = yield* find(terminalId)
              resizeLive(live, size.cols, size.rows)
              if (live.info.state === "restored") yield* startProcess(live, yield* folderFor(live))
              return Stream.callback<TerminalAttachEvent>((queue) =>
                Effect.gen(function* () {
                  flush(live)
                  const attachment: Attachment = {
                    id: attachmentId,
                    queue,
                    sent: live.seq,
                    acked: live.parsed,
                    stale: false,
                  }
                  sendSnapshot(live, attachment)
                  if (live.info.state === "exited") {
                    offer(attachment, { _tag: "Exited", exitCode: live.info.exitCode })
                  }
                  live.attachments.set(attachmentId, attachment)
                  yield* Effect.addFinalizer(() =>
                    Effect.sync(() => {
                      if (live.attachments.get(attachmentId) === attachment) {
                        live.attachments.delete(attachmentId)
                      }
                    }),
                  )
                }),
              )
            }),
          )

        const write = (terminalId: string, data: string) =>
          Effect.map(find(terminalId), (live) => live.pty?.write(data))

        const resize = (terminalId: string, cols: number, rows: number) =>
          Effect.map(find(terminalId), (live) => resizeLive(live, cols, rows))

        const ack = (terminalId: string, attachmentId: string, seq: number) =>
          Effect.sync(() => {
            const live = lives.get(terminalId)
            const attachment = live?.attachments.get(attachmentId)
            if (live === undefined || attachment === undefined) return
            attachment.acked = Math.max(attachment.acked, seq)
            if (attachment.stale && attachment.acked >= attachment.sent) {
              sendSnapshot(live, attachment)
            }
          })

        const closeOwner = (owner: TerminalOwner) =>
          Effect.gen(function* () {
            const key = terminalOwnerKey(owner)
            for (const live of [...lives.values()]) {
              if (isOwnedBy(live, key)) yield* remove(live)
            }
            yield* Effect.forEach(yield* rowsOf(owner).pipe(Effect.orDie), (row) =>
              sql`DELETE FROM terminals WHERE id = ${row.id}`.pipe(Effect.orDie),
            )
            yield* fs.remove(folderOf(key), { recursive: true, force: true }).pipe(Effect.ignore)
            loadedOwners.delete(key)
          })

        const moveSession = (sessionId: SessionId, folder: string) =>
          Effect.gen(function* () {
            const owner: TerminalOwner = { _tag: "Session", sessionId }
            yield* ensureLoaded(owner)
            const key = terminalOwnerKey(owner)
            for (const live of [...lives.values()]) {
              if (!isOwnedBy(live, key)) continue
              live.folder = folder
              const { state, integration, busy } = live.info
              if (state === "restored" || state === "exited") {
                update(live, { cwd: folder, location: "folder" })
                saveCwd(live)
              } else if (integration && busy === false) {
                yield* stopProcess(live)
                feed(live, restartMarker(new Date(), "Moved to the thread's worktree"))
                update(live, { cwd: folder, location: "folder" })
                saveCwd(live)
                yield* startProcess(live, folder).pipe(
                  Effect.catch((error) =>
                    Effect.logWarning(`Could not restart terminal ${live.info.id}`, error.message),
                  ),
                )
              } else {
                update(live, { location: "checkout" })
              }
            }
          })

        const ensureStarted = (live: Live) =>
          live.info.state === "restored"
            ? Effect.flatMap(folderFor(live), (folder) => startProcess(live, folder))
            : Effect.void

        const settled = (live: Live) =>
          Effect.callback<void>((resume) => {
            live.screen.write("", () => resume(Effect.void))
          })

        const buffer = (live: Live) => live.screen.terminal.buffer.active
        const cursorLine = (live: Live) => buffer(live).baseY + buffer(live).cursorY

        const linesText = (live: Live, from: number, to: number) => {
          const lines: Array<string> = []
          for (let y = Math.max(0, from); y <= to; y++) {
            const line = buffer(live).getLine(y)
            if (line === undefined) continue
            const text = line.translateToString(true)
            if (line.isWrapped && lines.length > 0) lines[lines.length - 1] += text
            else lines.push(text)
          }
          while (lines.length > 0 && (lines.at(-1) ?? "").trim() === "") lines.pop()
          return lines
        }

        const lastLines = (lines: ReadonlyArray<string>, maxLines: number) => ({
          text: lines.slice(-maxLines).join("\n"),
          truncated: lines.length > maxLines,
        })

        const newCursor = (live: Live): string => {
          const marker = live.screen.marker()
          const id = String(++live.nextCursor)
          if (marker !== undefined) {
            live.cursors.set(id, { marker, commands: live.commandsStarted })
          }
          while (live.cursors.size > CURSORS_KEPT) {
            const oldest = live.cursors.keys().next().value
            if (oldest === undefined) break
            live.cursors.get(oldest)?.marker.dispose()
            live.cursors.delete(oldest)
          }
          return id
        }

        const resolveCursor = (live: Live, since: string | undefined) => {
          if (since === undefined) return undefined
          const cursor = live.cursors.get(since)
          return cursor === undefined || cursor.marker.line < 0
            ? { line: 0, commands: live.commandsStarted, dropped: true }
            : { line: cursor.marker.line, commands: cursor.commands, dropped: false }
        }

        const info = (terminalId: string) => Effect.map(find(terminalId), (live) => live.info)

        const agentCursor = (terminalId: string) =>
          Effect.gen(function* () {
            const live = yield* find(terminalId)
            yield* ensureStarted(live)
            yield* settled(live)
            return newCursor(live)
          })

        const agentRead = (
          terminalId: string,
          options: {
            readonly view: "output" | "screen"
            readonly since: string | undefined
            readonly maxLines: number
          },
        ) =>
          Effect.gen(function* () {
            const live = yield* find(terminalId)
            yield* ensureStarted(live)
            yield* settled(live)
            const end = cursorLine(live)
            if (options.view === "screen") {
              const top = buffer(live).baseY
              const shown = lastLines(linesText(live, top, top + live.screen.rows() - 1), Infinity)
              return { ...shown, cursor: newCursor(live), dropped: false }
            }
            const from = resolveCursor(live, options.since)
            const lines = linesText(live, from?.line ?? end - options.maxLines + 1, end)
            return {
              ...lastLines(lines, options.maxLines),
              cursor: newCursor(live),
              dropped: from?.dropped ?? false,
            } satisfies AgentRead
          })

        const agentWrite = (terminalId: string, data: string) =>
          Effect.gen(function* () {
            const live = yield* find(terminalId)
            yield* ensureStarted(live)
            live.pty?.write(data)
          })

        const agentWait = (
          terminalId: string,
          options: {
            readonly for: WaitFor
            readonly since: string | undefined
            readonly timeoutMs: number
            readonly maxLines: number
          },
        ) =>
          Effect.gen(function* () {
            const live = yield* find(terminalId)
            yield* ensureStarted(live)
            yield* settled(live)
            const start = resolveCursor(live, options.since) ?? {
              line: cursorLine(live),
              commands: live.commandsStarted,
              dropped: false,
            }
            const deadline = Date.now() + options.timeoutMs
            let lastSeq = live.seq
            let quietSince = Date.now()
            const finish = (
              outcome: AgentWait["outcome"],
              exitCode: number | null = null,
            ): AgentWait => ({
              ...lastLines(linesText(live, start.line, cursorLine(live)), options.maxLines),
              cursor: newCursor(live),
              dropped: start.dropped,
              outcome,
              exitCode,
            })
            for (;;) {
              yield* settled(live)
              const wanted = options.for
              if (wanted._tag === "command") {
                if (!live.info.integration) return finish("unsupported")
                const ended = live.commands.find(
                  (command) => command.ordinal > start.commands && command.done,
                )
                if (ended !== undefined) return finish("command", ended.exitCode)
              } else if (wanted._tag === "pattern") {
                const text = linesText(live, start.line, cursorLine(live)).join("\n")
                if (wanted.pattern.test(text)) return finish("pattern")
              } else if (live.seq !== lastSeq) {
                lastSeq = live.seq
                quietSince = Date.now()
              } else if (Date.now() - quietSince >= wanted.quietMs) {
                return finish("quiet")
              }
              if (live.info.state === "exited") return finish("exited", live.info.exitCode)
              if (Date.now() >= deadline) return finish("timeout")
              yield* Effect.sleep(WAIT_POLL)
            }
          })

        return TerminalService.of({
          list,
          watch,
          open,
          close,
          rename,
          restart,
          attach,
          write,
          resize,
          ack,
          shells: Effect.sync(() =>
            shellsNow().map(({ id, name, path }): ShellInfo => ({ id, name, path })),
          ),
          closeOwner,
          moveSession,
          processIds: Effect.sync(() => {
            const ids = new Map<number, TerminalId>()
            for (const live of lives.values()) {
              if (live.pty !== undefined) ids.set(live.pty.pid, live.info.id)
            }
            return ids
          }),
          info,
          agentCursor,
          agentRead,
          agentWrite,
          agentWait,
        })
      }),
    )
}

/**
 * The local URLs in the complete part of `carry + data`, up to its last whitespace, and what is
 * left to carry into the next chunk: a URL never holds whitespace, so one split across chunks is
 * whole by the time it is scanned. The carry is capped, so a program that never prints whitespace
 * costs nothing.
 */
export const scanLocalUrls = (
  carry: string,
  data: string,
): { readonly urls: ReadonlyArray<string>; readonly carry: string } => {
  const text = carry + data
  const cut = Math.max(
    text.lastIndexOf(" "),
    text.lastIndexOf("\n"),
    text.lastIndexOf("\r"),
    text.lastIndexOf("\t"),
  )
  const rest = text.slice(cut + 1)
  return {
    urls: cut < 0 ? [] : localUrls(text.slice(0, cut + 1)),
    carry: rest.length > URL_CARRY ? "" : rest,
  }
}
