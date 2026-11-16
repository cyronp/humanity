import { PATCH_TOOL, type KiroModel } from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer, Option, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { AcpFailed, connectAcp } from "../acp/Connection.ts"
import { decode, type ToolCallFields } from "../acp/protocol.ts"
import type { AcpConnect, AcpProfile, AcpUpdate } from "../agent/AcpRunner.ts"
import { acpPatchFile, acpPath, type NamedTool } from "../agent/normalizeAcp.ts"
import { isInsideDir } from "../paths.ts"

/**
 * Kiro (Beta) runs as the Kiro CLI's Agent Client Protocol server, `kiro-cli
 * acp`, which Humanity starts and speaks to over standard input and output.
 *
 * The flags are the ones Kiro's V3 migration guide asks clients to send:
 * `--agent-engine=v3` (Kiro 3.0 starts V2 when it is left out) and
 * `--auth-method=cli`, so Kiro uses the login in its own folder.
 *
 * A Kiro session starts with its `autopilot` setting on ("Agent executes tools
 * without confirmation"). Humanity turns it off before the first prompt, so
 * Kiro is supervised: it asks before a call that is not a read, and asks once
 * more, when a turn ends, about the files the turn changed. Humanity answers
 * each with `allow_once` only. Kiro's own saved rules
 * (`~/.kiro/settings/permissions.yaml`) are not checked by Humanity; see the
 * Beta notes in `docs/spec.md`.
 */
export const KIRO_PRODUCT = "Kiro"
export const KIRO_ARGS: ReadonlyArray<string> = ["acp", "--agent-engine=v3", "--auth-method=cli"]
/** Kiro's session setting for acting without asking, and the value that makes it ask. */
export const KIRO_SUPERVISED = { id: "autopilot", value: "off" } as const
/** Kiro lists its `model` setting, and `effortLevel` with it, only once a model was written. */
const KIRO_MODEL_OPTION = "model"
const KIRO_STEER = "_session/steer"
/** Kiro fetches an Identity Center account's cloud config as a tool call of its own. */
const KIRO_CLOUD_CONFIG_TOOL = "fetch_cloud_config"
/**
 * Kiro can drop a cancel sent right after the prompt and run the turn to its
 * end; it honours one sent once the turn has begun.
 */
const KIRO_CANCEL_HOLD = "2 seconds"
/** After a steer, Kiro's model ends its answer with a note meant for Kiro's own UI. */
const STEERING_NOTE = "[STEERING steer-"

/** What Kiro says about an account: whether it is signed in and what it offers. */
export interface KiroProbe {
  readonly cliVersion: string | null
  readonly kiroHome: string
  readonly signedIn: boolean
  readonly models: ReadonlyArray<KiroModel>
}

const PROBE_TIMEOUT = "30 seconds"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** What Kiro adds to a message under `_meta.kiro`; empty when it adds nothing. */
const kiroMeta = (holder: unknown): Record<string, unknown> => {
  const meta = isRecord(holder) ? holder["_meta"] : undefined
  const kiro = isRecord(meta) ? meta["kiro"] : undefined
  return isRecord(kiro) ? kiro : {}
}

const stringOf = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

/** `kiro-cli 2.32.0` → `2.32.0` */
export const kiroCliVersion = (output: string): string | null =>
  /\d+\.\d+\.\d+[\w.-]*/.exec(output)?.[0] ?? null

/**
 * Reads `kiro-cli whoami --format json`: it exits with 1 and `{"account":null}`
 * when nobody is signed in. `undefined` when the answer says neither.
 */
export const kiroSignedIn = (output: {
  readonly exitCode: number
  readonly stdout: string
}): boolean | undefined => {
  if (output.exitCode === 0) return true
  return output.stdout.replace(/\s/g, "").includes('"account":null') ? false : undefined
}

const ModelList = Schema.fromJsonString(
  Schema.Struct({
    models: Schema.Array(
      Schema.Struct({
        model_id: Schema.String,
        model_name: Schema.optional(Schema.NullOr(Schema.String)),
        description: Schema.optional(Schema.NullOr(Schema.String)),
      }),
    ),
  }),
)
const decodeModelList = decode(ModelList)

/**
 * Reads `kiro-cli chat --list-models --format json`: the models of the
 * account, in Kiro's order. A session lists them only after it has started on
 * one, so they are asked of the CLI. Empty when the answer cannot be read.
 */
export const kiroModelsFromList = (stdout: string): ReadonlyArray<KiroModel> =>
  Option.match(decodeModelList(stdout.trim()), {
    onNone: () => [],
    onSome: (list) =>
      list.models.map((model) => ({
        value: model.model_id,
        displayName: model.model_name ?? model.model_id,
        description: model.description ?? "",
      })),
  })

/** Length of the longest end of `text` that could still grow into the steering note. */
const notePrefixLength = (text: string): number => {
  for (let length = Math.min(text.length, STEERING_NOTE.length - 1); length > 0; length -= 1) {
    if (STEERING_NOTE.startsWith(text.slice(-length))) return length
  }
  return 0
}

/**
 * Drops the `[STEERING steer-…: …]` note from an answer as it streams. The
 * end of a chunk that may be the start of the note is held back until the
 * next chunk shows otherwise.
 */
const steeringNoteFilter = () => {
  let state: { held: string; inNote: boolean } | undefined
  return (update: AcpUpdate): AcpUpdate => {
    if (update.sessionUpdate === "session_info_update") {
      const kind = kiroMeta(update)["kind"]
      if (kind === "steering_injected") state = { held: "", inNote: false }
      else if (kind === "steering_cleared") state = undefined
      return update
    }
    const content = update["content"]
    if (
      state === undefined ||
      update.sessionUpdate !== "agent_message_chunk" ||
      !isRecord(content) ||
      typeof content["text"] !== "string"
    ) {
      return update
    }
    let pending = state.held + content["text"]
    let visible = ""
    state.held = ""
    while (pending.length > 0) {
      if (state.inNote) {
        const end = pending.indexOf("]")
        if (end < 0) break
        pending = pending.slice(end + 1)
        state.inNote = false
        continue
      }
      const start = pending.indexOf(STEERING_NOTE)
      if (start >= 0) {
        visible += pending.slice(0, start).trimEnd()
        pending = pending.slice(start + STEERING_NOTE.length)
        state.inNote = true
        continue
      }
      const held = notePrefixLength(pending)
      visible += pending.slice(0, pending.length - held)
      state.held = pending.slice(pending.length - held)
      break
    }
    return { ...update, content: { ...content, text: visible } }
  }
}

/** Tells Kiro's cloud-config call, and every update that follows it, from the conversation. */
const cloudConfigFilter = () => {
  const running = new Set<string>()
  return (update: AcpUpdate): boolean => {
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      return false
    }
    const id = update["toolCallId"]
    if (typeof id !== "string") return false
    if (kiroMeta(update)["toolId"] === KIRO_CLOUD_CONFIG_TOOL) running.add(id)
    else if (!running.has(id)) return false
    if (update["status"] === "completed" || update["status"] === "failed") running.delete(id)
    return true
  }
}

const TURN_ACTIVITY: ReadonlyArray<string> = [
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
]

/** Kiro titles an MCP call `@<server>/<tool>`. */
const MCP_TITLE = /^@([^/\s]+)\/(\S+)$/

/**
 * An MCP call under the name every agent's MCP calls go by in Humanity,
 * `mcp__<server>__<tool>`, with the tool's arguments as its input. Kiro titles
 * it `@<server>/<tool>` and names the server under `_meta.kiro`; a call that
 * does not say both is left to its own name.
 */
export const kiroMcpTool = (call: ToolCallFields): NamedTool | undefined => {
  const titled = MCP_TITLE.exec(call.title ?? "")
  const server = stringOf(kiroMeta(call), "serverName")
  if (titled === null || server === undefined || titled[1] !== server) return undefined
  return {
    toolName: `mcp__${server}__${titled[2] ?? ""}`,
    input: isRecord(call.rawInput) ? call.rawInput : {},
  }
}

/**
 * What Kiro does its own way. `readFile` reads a file of the session's folder
 * as it is now (`undefined` when there is none), to show a change against it.
 */
export const kiroProfile =
  (readFile: (path: string) => Effect.Effect<string | undefined>) =>
  (run: { readonly cwd: string }): AcpProfile => {
    const isCloudConfig = cloudConfigFilter()
    const withoutSteeringNote = steeringNoteFilter()
    return {
      product: KIRO_PRODUCT,
      settings: [KIRO_SUPERVISED],
      lateModelOption: KIRO_MODEL_OPTION,
      cancelHold: {
        started: (update) =>
          TURN_ACTIVITY.includes(update.sessionUpdate) ||
          (update.sessionUpdate === "session_info_update" &&
            kiroMeta(update)["kind"] === "turn_start"),
        atMost: KIRO_CANCEL_HOLD,
      },
      update: (update) => (isCloudConfig(update) ? undefined : withoutSteeringNote(update)),
      subtask: (update) => {
        const kiro = kiroMeta(update)
        const id = stringOf(kiro, "agentSubtaskId")
        return id === undefined ? undefined : { id, owner: kiro["kind"] === "agent-subtask" }
      },
      /**
       * Kiro shows a file change's diff only once it was allowed. Before that
       * it says which file and what the file will hold, which is enough to ask
       * about it as the change it is.
       */
      toolCall: (call) =>
        Effect.gen(function* () {
          const mcp = kiroMcpTool(call)
          if (mcp !== undefined) return mcp
          if (call.kind !== "edit") return undefined
          if ((call.content ?? []).some((part) => part.type === "diff")) return undefined
          const previewed = kiroMeta(call)["preview"]
          const preview = isRecord(previewed) ? previewed : {}
          const raw = isRecord(call.rawInput) ? call.rawInput : {}
          const named = stringOf(preview, "file") ?? stringOf(raw, "path")
          const after = stringOf(preview, "modifiedContent") ?? stringOf(raw, "text")
          if (named === undefined || named === "" || after === undefined) return undefined
          const path = acpPath(named)
          const absolute = isAbsolute(path) ? resolve(path) : resolve(run.cwd, path)
          const before =
            stringOf(preview, "originalContent") ??
            // A file outside the session's folder is denied whatever it holds: no need to read it.
            (isInsideDir(run.cwd, absolute) ? yield* readFile(absolute) : undefined)
          return { toolName: PATCH_TOOL, input: { changes: [acpPatchFile(path, before, after)] } }
        }),
      steer: (connection, sessionId, message) =>
        connection
          .request(KIRO_STEER, { sessionId, message })
          .pipe(
            Effect.flatMap((answer) =>
              isRecord(answer) && answer["queued"] === true
                ? Effect.void
                : Effect.fail(new AcpFailed({ reason: "Kiro did not queue the message." })),
            ),
          ),
      review: (request) => {
        const kiro = kiroMeta(request)
        if (kiro["type"] !== "turn_approval" || !Array.isArray(kiro["files"])) return undefined
        return (kiro["files"] as ReadonlyArray<unknown>).map((file) =>
          // A file no call stands for was changed without Humanity being asked.
          isRecord(file) && typeof file["toolCallId"] === "string" ? file["toolCallId"] : "",
        )
      },
    }
  }

/**
 * The Kiro runtime threads run on: the `kiro-cli` on the PATH, authenticated by
 * the login in its own folder (`KIRO_HOME`, else `~/.kiro`), exactly like the
 * human's own terminal sessions.
 */
export class Kiro extends Context.Service<
  Kiro,
  {
    /** The executable Humanity runs: `kiro-cli` from the PATH. */
    readonly executable: string
    /** Where the default login lives: `KIRO_HOME`, else `~/.kiro`. */
    readonly home: string
    /**
     * Starts `kiro-cli acp` in `cwd` until the scope closes. `configDir` is the
     * folder of the account it runs as; without it, the default login.
     */
    readonly connect: AcpConnect
    /** What Kiro does its own way, for one run in a folder. */
    readonly profile: (run: { readonly cwd: string }) => AcpProfile
    /**
     * Asks the CLI who is signed in and which models the account has. Opens
     * no session, so Kiro keeps none and starts no MCP server for it.
     */
    readonly probe: (kiroHome?: string) => Effect.Effect<KiroProbe, AcpFailed>
  }
>()("humanity/Kiro") {
  static readonly layer = Layer.effect(
    Kiro,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const fs = yield* FileSystem.FileSystem
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      )
      const home = env["KIRO_HOME"] ?? join(homedir(), ".kiro")
      const executable = "kiro-cli"
      // An added account is a Kiro folder of its own; the default login is whatever Kiro finds.
      const envFor = (kiroHome: string | undefined) =>
        kiroHome === undefined ? env : { ...env, KIRO_HOME: kiroHome }

      const connect: AcpConnect = (options) =>
        connectAcp({
          product: KIRO_PRODUCT,
          executable,
          args: KIRO_ARGS,
          cwd: options.cwd,
          env: envFor(options.configDir),
          onRequest: options.onRequest,
          onNotification: options.onNotification,
        }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner))

      const collect = (stream: Stream.Stream<Uint8Array, unknown>) =>
        stream.pipe(Stream.decodeText(), Stream.mkString)

      /** Runs the CLI to its end and hands on what it printed. */
      const cli = (kiroHome: string | undefined, args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make(executable, [...args], { env: envFor(kiroHome) }),
          )
          const [stdout, stderr, exitCode] = yield* Effect.all(
            [collect(handle.stdout), collect(handle.stderr), handle.exitCode],
            { concurrency: "unbounded" },
          )
          return { stdout, stderr, exitCode: Number(exitCode) }
        }).pipe(
          Effect.scoped,
          Effect.mapError(
            (cause) => new AcpFailed({ reason: `Kiro could not be started: ${String(cause)}` }),
          ),
          Effect.timeoutOrElse({
            duration: PROBE_TIMEOUT,
            orElse: () =>
              Effect.fail(
                new AcpFailed({ reason: `Kiro did not answer within ${PROBE_TIMEOUT}.` }),
              ),
          }),
        )

      const probe = (kiroHome?: string) =>
        Effect.gen(function* () {
          const version = yield* cli(kiroHome, ["--version"])
          const whoami = yield* cli(kiroHome, ["whoami", "--format", "json"])
          const signedIn = kiroSignedIn(whoami)
          if (signedIn === undefined) {
            const said = (whoami.stderr.trim() || whoami.stdout.trim()).slice(0, 300)
            return yield* new AcpFailed({
              reason: `Kiro did not say who is signed in (kiro-cli whoami).${said === "" ? "" : `\n${said}`}`,
            })
          }
          // Signed out, listing the models starts a sign-in in the browser instead.
          const models = signedIn
            ? yield* cli(kiroHome, ["chat", "--list-models", "--format", "json"]).pipe(
                Effect.map((listed) =>
                  listed.exitCode === 0 ? kiroModelsFromList(listed.stdout) : [],
                ),
                Effect.orElseSucceed((): ReadonlyArray<KiroModel> => []),
              )
            : []
          return {
            cliVersion: kiroCliVersion(version.stdout),
            kiroHome: kiroHome ?? home,
            signedIn,
            models,
          } satisfies KiroProbe
        })

      const readFile = (path: string) =>
        fs.readFileString(path).pipe(Effect.orElseSucceed(() => undefined))

      return { executable, home, connect, profile: kiroProfile(readFile), probe }
    }),
  )

  static readonly layerTest = (options: { readonly probe?: Kiro["Service"]["probe"] } = {}) => {
    const unused = new AcpFailed({ reason: "Kiro is not used by this test." })
    return Layer.succeed(Kiro, {
      executable: "kiro-cli",
      home: "/home/me/.kiro",
      connect: () => Effect.fail(unused),
      profile: kiroProfile(() => Effect.succeed(undefined)),
      probe: options.probe ?? (() => Effect.fail(unused)),
    })
  }
}
