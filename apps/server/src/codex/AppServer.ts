import { type Cause, Data, Deferred, Effect, Option, Queue, type Scope, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { decode, InitializeResponse } from "./protocol.ts"

export class CodexFailed extends Data.TaggedError("CodexFailed")<{
  readonly reason: string
}> {}

/** A notification from Codex, or a request it makes of Humanity. */
export interface ServerMessage {
  readonly method: string
  readonly params: unknown
}

/** Humanity's answer to a request from Codex, and what to do once it is sent. */
export interface ServerReply {
  readonly result: unknown
  readonly afterwards?: Effect.Effect<void>
}

/** One running `codex app-server`, spoken to over its standard input and output. */
export interface AppServer {
  readonly cliVersion: string | undefined
  readonly codexHome: string | undefined
  readonly request: (method: string, params?: unknown) => Effect.Effect<unknown, CodexFailed>
  /** What Codex reports, in order. Fails when the process stops on its own. */
  readonly notifications: Stream.Stream<ServerMessage, CodexFailed>
}

export interface AppServerOptions {
  readonly executable: string
  readonly cwd: string
  readonly env: Record<string, string>
  /**
   * Answers a request from Codex (an approval, a question). A failure goes
   * back to Codex as an error. Interrupted when the connection closes.
   */
  readonly onRequest: (request: ServerMessage) => Effect.Effect<ServerReply, CodexFailed>
}

const CLIENT_VERSION = "0.1.0"
const HANDSHAKE_TIMEOUT = "30 seconds"

/** Streams Humanity never shows: output as it is typed, thoughts as they form, the running diff. */
const UNUSED_NOTIFICATIONS: ReadonlyArray<string> = [
  "item/commandExecution/outputDelta",
  "item/fileChange/outputDelta",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/summaryPartAdded",
  "item/reasoning/textDelta",
  "item/plan/delta",
  "turn/diff/updated",
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseLine = (line: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(line)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** `humanity/0.169.0 (Windows 10; x86_64) …` → `0.169.0` */
export const cliVersionOf = (userAgent: string): string | undefined =>
  /^[^/\s]+\/(\S+)/.exec(userAgent)?.[1]

const decodeInitialize = decode(InitializeResponse)

/**
 * Starts `codex app-server` and shakes hands with it. Messages are JSON, one
 * per line, in both directions. The process is stopped when the scope closes.
 */
export const connectAppServer = (
  options: AppServerOptions,
): Effect.Effect<AppServer, CodexFailed, Scope.Scope | ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const scope = yield* Effect.scope
    const outbound = yield* Queue.unbounded<string>()
    const notifications = yield* Queue.unbounded<ServerMessage, CodexFailed | Cause.Done>()
    const pending = new Map<number, Deferred.Deferred<unknown, CodexFailed>>()
    const stderrTail: Array<string> = []
    let nextId = 1
    let stopped: CodexFailed | undefined

    const handle = yield* spawner
      .spawn(
        ChildProcess.make(options.executable, ["app-server"], {
          cwd: options.cwd,
          env: options.env,
          stdin: Stream.fromQueue(outbound).pipe(
            Stream.map((line) => `${line}\n`),
            Stream.encodeText,
          ),
        }),
      )
      .pipe(
        Effect.mapError(
          (cause) => new CodexFailed({ reason: `Codex could not be started: ${String(cause)}` }),
        ),
      )

    const send = (message: unknown) =>
      Queue.offer(outbound, JSON.stringify(message)).pipe(Effect.asVoid)

    const answer = (id: unknown, request: ServerMessage) =>
      options.onRequest(request).pipe(
        Effect.matchEffect({
          onSuccess: (reply) =>
            send({ id, result: reply.result }).pipe(
              Effect.andThen(reply.afterwards ?? Effect.void),
            ),
          onFailure: (error) => send({ id, error: { code: -32000, message: error.reason } }),
        }),
      )

    const dispatch = (line: string) =>
      Effect.gen(function* () {
        const message = parseLine(line)
        if (message === undefined) return
        const { id, method } = message
        if (typeof method === "string") {
          const incoming: ServerMessage = { method, params: message["params"] }
          if (id === undefined) yield* Queue.offer(notifications, incoming)
          // Waiting for a human must not hold up what Codex says meanwhile.
          else yield* Effect.forkIn(answer(id, incoming), scope)
          return
        }
        if (typeof id !== "number") return
        const waiter = pending.get(id)
        if (waiter === undefined) return
        pending.delete(id)
        const error = message["error"]
        if (error === undefined) {
          yield* Deferred.succeed(waiter, message["result"])
        } else {
          const detail = isRecord(error) ? error["message"] : undefined
          yield* Deferred.fail(
            waiter,
            new CodexFailed({
              reason: typeof detail === "string" ? detail : JSON.stringify(error),
            }),
          )
        }
      })

    const stop = Effect.gen(function* () {
      const detail = stderrTail.join("\n").trim()
      const failure = new CodexFailed({
        reason:
          detail === "" ? "Codex stopped unexpectedly." : `Codex stopped unexpectedly.\n${detail}`,
      })
      stopped = failure
      for (const waiter of pending.values()) yield* Deferred.fail(waiter, failure)
      pending.clear()
      yield* Queue.fail(notifications, failure)
    })

    yield* handle.stderr.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach((line) =>
        Effect.gen(function* () {
          stderrTail.push(line)
          if (stderrTail.length > 3) stderrTail.shift()
          yield* Effect.logDebug("codex stderr", line)
        }),
      ),
      Effect.ignore,
      Effect.forkIn(scope),
    )

    yield* handle.stdout.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach(dispatch),
      Effect.ignore,
      Effect.andThen(stop),
      Effect.forkIn(scope),
    )

    const request = (method: string, params?: unknown) =>
      Effect.suspend(() => {
        if (stopped !== undefined) return Effect.fail(stopped)
        const id = nextId++
        return Effect.gen(function* () {
          const waiter = yield* Deferred.make<unknown, CodexFailed>()
          pending.set(id, waiter)
          yield* send(params === undefined ? { id, method } : { id, method, params })
          return yield* Deferred.await(waiter)
        }).pipe(Effect.ensuring(Effect.sync(() => pending.delete(id))))
      })

    const initialized = yield* request("initialize", {
      clientInfo: { name: "humanity", title: "Humanity", version: CLIENT_VERSION },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
        optOutNotificationMethods: UNUSED_NOTIFICATIONS,
      },
    }).pipe(
      Effect.timeoutOrElse({
        duration: HANDSHAKE_TIMEOUT,
        orElse: () =>
          Effect.fail(
            new CodexFailed({ reason: `Codex did not answer within ${HANDSHAKE_TIMEOUT}.` }),
          ),
      }),
    )
    yield* send({ method: "initialized" })
    const info = Option.getOrUndefined(decodeInitialize(initialized))

    return {
      cliVersion: info === undefined ? undefined : cliVersionOf(info.userAgent),
      codexHome: info?.codexHome ?? undefined,
      request,
      notifications: Stream.fromQueue(notifications),
    } satisfies AppServer
  })
