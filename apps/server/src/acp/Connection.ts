import { Data, Deferred, Effect, Option, Queue, type Scope, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { decode, InitializeResponse, PROTOCOL_VERSION } from "./protocol.ts"

export class AcpFailed extends Data.TaggedError("AcpFailed")<{
  readonly reason: string
  /** The request named a method Humanity does not answer. */
  readonly unsupported?: boolean
}> {}

/** A notification from the agent, or a request it makes of Humanity. */
export interface AgentMessage {
  readonly method: string
  readonly params: unknown
}

/** One running ACP agent, spoken to over its standard input and output. */
export interface AcpConnection {
  /** What the agent said about itself and what it can do, when it shook hands. */
  readonly agent: InitializeResponse
  readonly request: (method: string, params?: unknown) => Effect.Effect<unknown, AcpFailed>
  readonly notify: (method: string, params?: unknown) => Effect.Effect<void>
  /** Fails when the process stops on its own; never succeeds. */
  readonly stopped: Effect.Effect<never, AcpFailed>
}

export interface AcpConnectionOptions {
  /** The agent as the human knows it, e.g. `Kiro`, for messages. */
  readonly product: string
  readonly executable: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: Record<string, string>
  /**
   * Answers a request from the agent (a permission, mostly). A failure goes
   * back to the agent as an error. Interrupted when the connection closes.
   */
  readonly onRequest: (request: AgentMessage) => Effect.Effect<unknown, AcpFailed>
  /**
   * Takes what the agent reports. Run in the order the agent wrote, and
   * before the answer to a request that it wrote later is delivered, so a
   * turn's last update is always handled before the turn is seen to end.
   */
  readonly onNotification: (notification: AgentMessage) => Effect.Effect<void>
}

const CLIENT_VERSION = "0.1.0"
const HANDSHAKE_TIMEOUT = "30 seconds"

const METHOD_NOT_FOUND = -32601
const INTERNAL_ERROR = -32603

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

const decodeInitialize = decode(InitializeResponse)

/**
 * Starts an ACP agent and shakes hands with it. Messages are JSON-RPC 2.0,
 * one per line, in both directions. Humanity offers the agent neither its
 * file system nor a terminal: the agent uses its own tools, and asks before
 * it does. The process is stopped when the scope closes.
 */
export const connectAcp = (
  options: AcpConnectionOptions,
): Effect.Effect<AcpConnection, AcpFailed, Scope.Scope | ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const { product } = options
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const scope = yield* Effect.scope
    const outbound = yield* Queue.unbounded<string>()
    const pending = new Map<number, Deferred.Deferred<unknown, AcpFailed>>()
    const stopped = yield* Deferred.make<never, AcpFailed>()
    const stderrTail: Array<string> = []
    let nextId = 1
    let failure: AcpFailed | undefined

    const handle = yield* spawner
      .spawn(
        ChildProcess.make(options.executable, [...options.args], {
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
          (cause) => new AcpFailed({ reason: `${product} could not be started: ${String(cause)}` }),
        ),
      )

    const send = (message: Record<string, unknown>) =>
      Queue.offer(outbound, JSON.stringify({ jsonrpc: "2.0", ...message })).pipe(Effect.asVoid)

    const answer = (id: unknown, request: AgentMessage) =>
      options.onRequest(request).pipe(
        // The agent waits for an answer; one that could not be worked out is still an answer.
        Effect.catchDefect((defect) =>
          Effect.logWarning("acp request not answered", defect).pipe(
            Effect.andThen(
              Effect.fail(
                new AcpFailed({ reason: `Humanity could not answer ${request.method}.` }),
              ),
            ),
          ),
        ),
        Effect.matchEffect({
          onSuccess: (result) => send({ id, result }),
          onFailure: (error) =>
            send({
              id,
              error: {
                code: error.unsupported === true ? METHOD_NOT_FOUND : INTERNAL_ERROR,
                message: error.reason,
              },
            }),
        }),
      )

    const dispatch = (line: string) =>
      Effect.gen(function* () {
        const message = parseLine(line)
        if (message === undefined) return
        const { id, method } = message
        if (typeof method === "string") {
          const incoming: AgentMessage = { method, params: message["params"] }
          if (id === undefined || id === null) yield* options.onNotification(incoming)
          // Waiting for a human must not hold up what the agent says meanwhile.
          else yield* Effect.forkIn(answer(id, incoming), scope)
          return
        }
        if (typeof id !== "number") return
        const waiter = pending.get(id)
        if (waiter === undefined) return
        pending.delete(id)
        const error = message["error"]
        if (error === undefined || error === null) {
          yield* Deferred.succeed(waiter, message["result"])
        } else {
          const detail = isRecord(error) ? error["message"] : undefined
          yield* Deferred.fail(
            waiter,
            new AcpFailed({ reason: typeof detail === "string" ? detail : JSON.stringify(error) }),
          )
        }
      })

    const stop = Effect.gen(function* () {
      const detail = stderrTail.join("\n").trim()
      const stoppedBecause = new AcpFailed({
        reason:
          detail === ""
            ? `${product} stopped unexpectedly.`
            : `${product} stopped unexpectedly.\n${detail}`,
      })
      failure = stoppedBecause
      for (const waiter of pending.values()) yield* Deferred.fail(waiter, stoppedBecause)
      pending.clear()
      yield* Deferred.fail(stopped, stoppedBecause)
    })

    yield* handle.stderr.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach((line) =>
        Effect.gen(function* () {
          stderrTail.push(line)
          if (stderrTail.length > 3) stderrTail.shift()
          yield* Effect.logDebug("acp stderr", line)
        }),
      ),
      Effect.ignore,
      Effect.forkIn(scope),
    )

    yield* handle.stdout.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      // One message that cannot be handled must not end the reading of all that follow.
      Stream.runForEach((line) =>
        dispatch(line).pipe(
          Effect.catchDefect((defect) => Effect.logWarning("acp message not handled", defect)),
        ),
      ),
      Effect.ignore,
      Effect.andThen(stop),
      Effect.forkIn(scope),
    )

    const request = (method: string, params?: unknown) =>
      Effect.suspend(() => {
        if (failure !== undefined) return Effect.fail(failure)
        const id = nextId++
        return Effect.gen(function* () {
          const waiter = yield* Deferred.make<unknown, AcpFailed>()
          pending.set(id, waiter)
          yield* send(params === undefined ? { id, method } : { id, method, params })
          return yield* Deferred.await(waiter)
        }).pipe(Effect.ensuring(Effect.sync(() => pending.delete(id))))
      })

    const initialized = yield* request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "humanity", title: "Humanity", version: CLIENT_VERSION },
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    }).pipe(
      Effect.timeoutOrElse({
        duration: HANDSHAKE_TIMEOUT,
        orElse: () =>
          Effect.fail(
            new AcpFailed({ reason: `${product} did not answer within ${HANDSHAKE_TIMEOUT}.` }),
          ),
      }),
    )

    const agent = Option.getOrElse(decodeInitialize(initialized), (): InitializeResponse => ({}))
    const speaks = agent.protocolVersion
    if (typeof speaks === "number" && speaks !== PROTOCOL_VERSION) {
      // Agents in the wild name a later version and still answer in this one's shapes.
      yield* Effect.logWarning(
        `${product} speaks ACP version ${speaks}; Humanity asked for ${PROTOCOL_VERSION}.`,
      )
    }

    return {
      agent,
      request,
      notify: (method: string, params?: unknown) =>
        send(params === undefined ? { method } : { method, params }),
      stopped: Deferred.await(stopped),
    } satisfies AcpConnection
  })
