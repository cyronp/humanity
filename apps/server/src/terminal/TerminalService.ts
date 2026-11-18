import {
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
import { join } from "node:path"
import type { LocateOptions } from "../agent/installedCli.ts"
import { SessionRepo } from "../db/SessionRepo.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { PreferencesService } from "../services/PreferencesService.ts"
import { ProjectService } from "../services/ProjectService.ts"
import { terminalEnvironment } from "./environment.ts"
import { PtyHost, type PtyProcess } from "./PtyHost.ts"
import { makeScreen, restartMarker, type Screen } from "./screen.ts"
import { detectShells, pickShell, type Shell, shellArgs, shellLocateOptions } from "./shells.ts"

/** The size of a terminal nobody has looked at yet. */
export const DEFAULT_COLS = 120
export const DEFAULT_ROWS = 30

/** Output is sent to browsers in batches: after this long, or once this much has piled up. */
const FLUSH_MS = 8
const FLUSH_CHARS = 16_384
/**
 * How far a browser may fall behind (in characters sent but not yet shown) before it is sent
 * nothing more; once it catches up it gets the screen as it is instead of what it missed.
 */
export const ATTACH_WINDOW = 512 * 1024

const SAVE_INTERVAL = "5 seconds"

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
  /** The terminal's `seq` up to which this view was sent output. */
  sent: number
  /** The `seq` up to which this view has shown it. */
  acked: number
  /** Too far behind: sent nothing until it catches up, then a fresh snapshot. */
  stale: boolean
}

interface Live {
  info: TerminalInfo
  readonly screen: Screen
  pty: PtyProcess | undefined
  /** Bumped whenever the process is replaced, so a killed process's last events are ignored. */
  generation: number
  /** Characters printed so far. */
  seq: number
  /** Characters the screen has parsed, so a snapshot shows exactly this much. */
  parsed: number
  /** Printed but not yet parsed by the screen, in order. */
  readonly tail: Array<{ readonly data: string; readonly end: number }>
  /** Printed but not yet sent to browsers, starting at `pendingFrom`. */
  pending: string
  pendingFrom: number
  flushTimer: ReturnType<typeof setTimeout> | undefined
  readonly attachments: Map<string, Attachment>
  /** Printed something since its screen was last saved. */
  dirty: boolean
  readonly scrollback: number
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
    /** Closes every terminal of a thread or a project and deletes what was saved of them. */
    readonly closeOwner: (owner: TerminalOwner) => Effect.Effect<void>
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
        /** The owners whose saved terminals were read back since the daemon started. */
        const loadedOwners = new Set<string>()
        /** Publishes the key of an owner whose terminals changed. */
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

        const isOwnedBy = (live: Live, ownerKey: string) =>
          terminalOwnerKey(live.info.owner) === ownerKey

        /**
         * Where the owner's terminals open: the thread's folder, the project's checkout, or the
         * home folder; and whether it can open any more (a thread that ended cannot).
         */
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

        // Output -------------------------------------------------------------------------------

        const offer = (attachment: Attachment, event: TerminalAttachEvent) =>
          void Queue.offerUnsafe(attachment.queue, event)

        /** The screen as it is, then what was printed but not yet parsed. */
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

        /** Everything a terminal shows goes through here: its process's output and our markers. */
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

        // Processes ----------------------------------------------------------------------------

        const stopProcess = (live: Live) => {
          live.generation++
          live.pty?.kill()
          live.pty = undefined
        }

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
            // ConPTY draws as if it started at the top of an empty screen: a shell started again
            // on a screen with something on it gets that screen scrolled up into the scrollback.
            if (process.platform === "win32" && live.seq > 0) {
              feed(live, `${"\r\n".repeat(live.screen.rows())}\x1b[H`)
            }
            const generation = ++live.generation
            const pty = yield* host
              .spawn({
                file: shell.path,
                args: shellArgs(shell, process.platform),
                cwd,
                env: terminalEnvironment(process.env, process.platform),
                cols: live.screen.cols(),
                rows: live.screen.rows(),
              })
              .pipe(
                Effect.mapError(
                  (error) => new TerminalSpawnFailed({ shell: shell.name, reason: error.reason }),
                ),
              )
            live.pty = pty
            pty.onData((data) => {
              if (live.generation === generation) feed(live, data)
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
              shell: shell.id,
              shellName: shell.name,
              cwd,
            })
          })

        const makeLive = (
          info: TerminalInfo,
          options: { readonly scrollback: number; readonly cols: number; readonly rows: number },
        ): Live => {
          const live: Live = {
            info,
            screen: makeScreen(options),
            pty: undefined,
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
          }
          // The queries a program sends (cursor position, device attributes…) are answered here,
          // from the same bytes the views draw: at once, whether or not a view is open (ConPTY
          // waits for one before it starts the shell), and once however many views are open.
          // The views stay silent on them.
          live.screen.onReply((reply) => live.pty?.write(reply))
          return live
        }

        // Persistence --------------------------------------------------------------------------

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
            for (const row of rows) {
              if (lives.has(row.id)) continue
              const info = infoOf(row, shells)
              const live = makeLive(info, { scrollback, cols: DEFAULT_COLS, rows: DEFAULT_ROWS })
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
          integration: false,
          createdAt: row.created_at,
        })

        const remove = (live: Live) =>
          Effect.gen(function* () {
            stopProcess(live)
            flush(live)
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
            for (const live of lives.values()) {
              stopProcess(live)
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

        // Operations ---------------------------------------------------------------------------

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
            integration: false,
            createdAt: DateTime.formatIso(yield* DateTime.now),
          }
          const live = makeLive(info, {
            scrollback: preferred.scrollback,
            cols: options.cols ?? DEFAULT_COLS,
            rows: options.rows ?? DEFAULT_ROWS,
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

        /** Where a shell starts again when the folder it was last in is gone. */
        const folderFor = (live: Live) =>
          Effect.map(Effect.option(placeOf(live.info.owner)), (place) =>
            Option.match(place, { onNone: () => live.info.cwd, onSome: ({ folder }) => folder }),
          )

        const restart = (terminalId: string) =>
          Effect.gen(function* () {
            const live = yield* find(terminalId)
            stopProcess(live)
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
        })
      }),
    )
}
