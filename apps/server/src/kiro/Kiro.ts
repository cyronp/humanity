import {
  CLI_COMMANDS,
  CLI_INSTALL_URLS,
  CliNotInstalled,
  PATCH_TOOL,
  type ProviderModel,
} from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { AcpFailed, connectAcp } from "../acp/Connection.ts"
import { type ToolCallFields } from "../acp/protocol.ts"
import type { AcpConnect, AcpProfile, AcpUpdate } from "../agent/AcpRunner.ts"
import { locateCli } from "../agent/installedCli.ts"
import { acpPatchFile, acpPath, type NamedTool } from "../agent/normalizeAcp.ts"
import { isInsideDir } from "../paths.ts"
import { decode, isRecord } from "../unknown.ts"
import { runProcess } from "../process.ts"

export const KIRO_PRODUCT = "Kiro"
export const KIRO_ARGS: ReadonlyArray<string> = ["acp", "--agent-engine=v3", "--auth-method=cli"]
export const KIRO_SUPERVISED = { id: "autopilot", value: "off" } as const
const KIRO_MODEL_OPTION = "model"
const KIRO_STEER = "_session/steer"
const KIRO_CLOUD_CONFIG_TOOL = "fetch_cloud_config"
const KIRO_CANCEL_HOLD = "2 seconds"
const STEERING_NOTE = "[STEERING steer-"

export interface KiroProbe {
  readonly cliVersion: string | null
  readonly kiroHome: string
  readonly signedIn: boolean
  readonly models: ReadonlyArray<ProviderModel>
}

const PROBE_TIMEOUT = "30 seconds"

const kiroMeta = (holder: unknown): Record<string, unknown> => {
  const meta = isRecord(holder) ? holder["_meta"] : undefined
  const kiro = isRecord(meta) ? meta["kiro"] : undefined
  return isRecord(kiro) ? kiro : {}
}

const stringOf = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

export const kiroCliVersion = (output: string): string | null =>
  /\d+\.\d+\.\d+[\w.-]*/.exec(output)?.[0] ?? null

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

export const kiroModelsFromList = (stdout: string): ReadonlyArray<ProviderModel> =>
  Option.match(decodeModelList(stdout.trim()), {
    onNone: () => [],
    onSome: (list) =>
      list.models.map((model) => ({
        value: model.model_id,
        displayName: model.model_name ?? model.model_id,
        description: model.description ?? "",
      })),
  })

const notePrefixLength = (text: string): number => {
  for (let length = Math.min(text.length, STEERING_NOTE.length - 1); length > 0; length -= 1) {
    if (STEERING_NOTE.startsWith(text.slice(-length))) return length
  }
  return 0
}

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

const MCP_TITLE = /^@([^/\s]+)\/(\S+)$/

export const kiroMcpTool = (call: ToolCallFields): NamedTool | undefined => {
  const titled = MCP_TITLE.exec(call.title ?? "")
  const server = stringOf(kiroMeta(call), "serverName")
  if (titled === null || server === undefined || titled[1] !== server) return undefined
  return {
    toolName: `mcp__${server}__${titled[2] ?? ""}`,
    input: isRecord(call.rawInput) ? call.rawInput : {},
  }
}

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
          isRecord(file) && typeof file["toolCallId"] === "string" ? file["toolCallId"] : "",
        )
      },
    }
  }

export class Kiro extends Context.Service<
  Kiro,
  {
    readonly executable: () => string
    readonly home: string
    readonly connect: AcpConnect
    readonly profile: (run: { readonly cwd: string }) => AcpProfile
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
      const launch = () => locateCli(CLI_COMMANDS.kiro)
      const executable = () => launch()?.path ?? CLI_COMMANDS.kiro
      const notInstalled = () =>
        new AcpFailed({
          reason: new CliNotInstalled({
            product: KIRO_PRODUCT,
            command: CLI_COMMANDS.kiro,
            installUrl: CLI_INSTALL_URLS.kiro,
          }).message,
        })
      const envFor = (kiroHome: string | undefined) =>
        kiroHome === undefined ? env : { ...env, KIRO_HOME: kiroHome }

      const connect: AcpConnect = (options) =>
        Effect.suspend(() => {
          const found = launch()
          if (found === undefined) return Effect.fail(notInstalled())
          return connectAcp({
            product: KIRO_PRODUCT,
            executable: found.command,
            args: [...found.args, ...KIRO_ARGS],
            cwd: options.cwd,
            env: envFor(options.configDir),
            onRequest: options.onRequest,
            onNotification: options.onNotification,
          })
        }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner))

      const cli = (kiroHome: string | undefined, args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const found = launch()
          if (found === undefined) return yield* notInstalled()
          return yield* runProcess(
            spawner,
            ChildProcess.make(found.command, [...found.args, ...args], { env: envFor(kiroHome) }),
          )
        }).pipe(
          Effect.mapError((cause) =>
            cause instanceof AcpFailed
              ? cause
              : new AcpFailed({ reason: `Kiro could not be started: ${String(cause)}` }),
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
          const models = signedIn
            ? yield* cli(kiroHome, ["chat", "--list-models", "--format", "json"]).pipe(
                Effect.map((listed) =>
                  listed.exitCode === 0 ? kiroModelsFromList(listed.stdout) : [],
                ),
                Effect.orElseSucceed((): ReadonlyArray<ProviderModel> => []),
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
      executable: () => "kiro-cli",
      home: "/home/me/.kiro",
      connect: () => Effect.fail(unused),
      profile: kiroProfile(() => Effect.succeed(undefined)),
      probe: options.probe ?? (() => Effect.fail(unused)),
    })
  }
}
