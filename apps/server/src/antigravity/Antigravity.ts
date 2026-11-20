import {
  type AntigravityModel,
  CLI_COMMANDS,
  CLI_INSTALL_URLS,
  CliNotInstalled,
  PATCH_TOOL,
} from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { AcpFailed, connectAcp } from "../acp/Connection.ts"
import type { InitializeResponse, ToolCallFields } from "../acp/protocol.ts"
import type { AcpConnect, AcpProfile, AcpRunContext } from "../agent/AcpRunner.ts"
import { systemPromptAppend } from "../agent/instructions.ts"
import { locateCli, parseCliVersion } from "../agent/installedCli.ts"
import { acpPatchFile, acpPath, type NamedTool } from "../agent/normalizeAcp.ts"
import type { PatchFile } from "../agent/normalizeCodex.ts"
import { isInsideDir } from "../paths.ts"

export const ANTIGRAVITY_PRODUCT = "Antigravity"
export const ANTIGRAVITY_ARGS: ReadonlyArray<string> = ["acp"]
export const ANTIGRAVITY_SUPERVISED_MODE = "default"
const MODE_OPTION = "mode"
const QUESTION_PREFIX = "interaction_"
const PROBE_TIMEOUT = "30 seconds"

export interface AntigravityProbe {
  readonly cliVersion: string | null
  readonly geminiHome: string
  readonly signedIn: boolean
  readonly models: ReadonlyArray<AntigravityModel>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const stringOf = (record: Record<string, unknown>, keys: ReadonlyArray<string>) => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") return value
  }
  return undefined
}

export const antigravitySettingsPath = (geminiHome: string): string =>
  join(geminiHome, "antigravity-cli", "settings.json")

const ASKING_PRESETS: ReadonlyArray<string> = ["request-review", "strict"]

export const antigravitySettingsProblem = (
  text: string | undefined,
  path: string,
): string | undefined => {
  if (text === undefined || text.trim() === "") return undefined
  let settings: unknown
  try {
    settings = JSON.parse(text)
  } catch {
    return `Humanity could not read ${path}, so it cannot tell whether Antigravity would ask before it acts. Make it plain JSON, then try again.`
  }
  if (!isRecord(settings)) return undefined
  const found: Array<string> = []
  const preset = settings["toolPermission"]
  if (typeof preset === "string" && preset !== "" && !ASKING_PRESETS.includes(preset)) {
    found.push(`"toolPermission": "${preset}"`)
  }
  const permissions = settings["permissions"]
  const allow = isRecord(permissions) ? permissions["allow"] : undefined
  if (Array.isArray(allow)) {
    for (const rule of allow) {
      if (typeof rule === "string" && !rule.trim().startsWith("read_file(")) {
        found.push(`the allow rule "${rule}"`)
      }
    }
  }
  if (found.length === 0) return undefined
  return `Antigravity's own settings let it run some calls without asking, so the thread's mode could not decide them: ${found.join(", ")}. Remove ${found.length === 1 ? "it" : "them"} from ${path}, then try again. Antigravity then asks before each call, and Humanity answers by the thread's mode.`
}

const EFFORT_SUFFIX = /^(.+)-(low|medium|high|xhigh|max)$/
const LEVEL_LABEL = /\s*\([^()]+\)$/
const MODEL_LINE = /^([A-Za-z0-9][\w.:/-]*)(?:\t+|\s{2,})(\S.*)$/

export const antigravityModelsFromList = (stdout: string): ReadonlyArray<AntigravityModel> => {
  const listed: Array<{ readonly slug: string; readonly label: string }> = []
  for (const line of stdout.split(/\r?\n/)) {
    const match = MODEL_LINE.exec(line.trim())
    if (match !== null) listed.push({ slug: match[1] ?? "", label: (match[2] ?? "").trim() })
  }
  const slugs = new Set(listed.map((model) => model.slug))
  const levels = new Map<string, Array<string>>()
  for (const { slug } of listed) {
    const match = EFFORT_SUFFIX.exec(slug)
    const family = match?.[1]
    if (family === undefined || slugs.has(family)) continue
    levels.set(family, [...(levels.get(family) ?? []), match?.[2] ?? ""])
  }
  const models = new Map<string, AntigravityModel>()
  for (const { slug, label } of listed) {
    const family = EFFORT_SUFFIX.exec(slug)?.[1]
    const efforts = family === undefined ? undefined : levels.get(family)
    if (family !== undefined && efforts !== undefined && efforts.length > 1) {
      if (!models.has(family)) {
        models.set(family, {
          value: family,
          displayName: label.replace(LEVEL_LABEL, ""),
          description: `Thinking: ${efforts.join(", ")}`,
        })
      }
    } else if (!models.has(slug)) {
      models.set(slug, { value: slug, displayName: label, description: "" })
    }
  }
  return [...models.values()]
}

const SIGNED_OUT = /authenticat|unauthenticated|not signed in|sign in|log ?in|credential/i

export const antigravitySignedIn = (output: {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}): boolean | undefined => {
  if (output.exitCode === 0 && antigravityModelsFromList(output.stdout).length > 0) return true
  if (SIGNED_OUT.test(`${output.stdout}\n${output.stderr}`)) return false
  return output.exitCode === 0 ? true : undefined
}

export const antigravityTakesSystemPrompt = (agent: InitializeResponse): boolean => {
  const meta = agent.agentCapabilities?._meta
  const antigravity = isRecord(meta) ? meta["antigravity"] : undefined
  const prompt = isRecord(antigravity) ? antigravity["systemPrompt"] : undefined
  return isRecord(prompt) && prompt["append"] === true
}

const MCP_TITLE = /^Run(?:ning)? mcp_(.+?)\??$/
const MCP_NAME = /^mcp_(.+)$/

export const antigravityMcpTool = (
  call: ToolCallFields,
  servers: ReadonlyArray<string>,
): NamedTool | undefined => {
  const named = [MCP_TITLE.exec(call.title ?? "")?.[1], MCP_NAME.exec(call.name ?? "")?.[1]]
  for (const rest of named) {
    if (rest === undefined) continue
    const server = servers
      .filter((candidate) => rest.startsWith(`${candidate}_`))
      .sort((a, b) => b.length - a.length)[0]
    if (server === undefined) continue
    return {
      toolName: `mcp__${server}__${rest.slice(server.length + 1)}`,
      input: isRecord(call.rawInput) ? call.rawInput : {},
    }
  }
  return undefined
}

interface Replacement {
  readonly target: string
  readonly replacement: string
}

const replacementOf = (value: unknown): Replacement | undefined => {
  if (!isRecord(value)) return undefined
  const target = stringOf(value, ["TargetContent", "target_content"])
  const replacement = stringOf(value, ["ReplacementContent", "replacement_content"])
  return target === undefined || replacement === undefined ? undefined : { target, replacement }
}

const replacementsOf = (raw: unknown): ReadonlyArray<Replacement> | undefined => {
  if (!isRecord(raw)) return undefined
  const chunks = raw["ReplacementChunks"] ?? raw["replacement_chunks"]
  if (Array.isArray(chunks)) {
    const all = chunks.map(replacementOf)
    return all.every((chunk) => chunk !== undefined) && all.length > 0
      ? (all as ReadonlyArray<Replacement>)
      : undefined
  }
  const single = replacementOf(raw)
  return single === undefined ? undefined : [single]
}

const replaceOnce = (text: string, { target, replacement }: Replacement): string | undefined => {
  const crlf = text.includes("\r\n") && !target.includes("\r\n")
  const find = crlf ? target.replaceAll("\n", "\r\n") : target
  const put = crlf ? replacement.replaceAll("\n", "\r\n") : replacement
  if (find === "") return undefined
  const first = text.indexOf(find)
  if (first < 0 || text.indexOf(find, first + 1) >= 0) return undefined
  return text.slice(0, first) + put + text.slice(first + find.length)
}

export const applyReplacements = (
  before: string,
  replacements: ReadonlyArray<Replacement>,
): string | undefined => {
  let text = before
  for (const each of replacements) {
    const next = replaceOnce(text, each)
    if (next === undefined) return undefined
    text = next
  }
  return text
}

export const antigravityEdit = (
  call: ToolCallFields,
  cwd: string,
  readFile: (path: string) => Effect.Effect<string | undefined>,
): Effect.Effect<NamedTool | undefined> =>
  Effect.gen(function* () {
    const raw = isRecord(call.rawInput) ? call.rawInput : {}
    const readInside = (path: string) => {
      const absolute = isAbsolute(path) ? resolve(path) : resolve(cwd, path)
      return isInsideDir(cwd, absolute) ? readFile(absolute) : Effect.succeed(undefined)
    }
    const diffs = (call.content ?? []).filter(
      (part) => part.type === "diff" && typeof part.path === "string" && part.path !== "",
    )
    if (diffs.length === 0) {
      const target = stringOf(raw, ["TargetFile", "target_file", "AbsolutePath", "absolute_path"])
      const content = stringOf(raw, ["CodeContent", "code_content"])
      if (target === undefined || target === "" || content === undefined) return undefined
      const path = acpPath(target)
      return {
        toolName: PATCH_TOOL,
        input: { changes: [acpPatchFile(path, yield* readInside(path), content)] },
      }
    }
    const byPath = new Map<string, Array<(typeof diffs)[number]>>()
    for (const part of diffs) {
      const path = acpPath(part.path ?? "")
      byPath.set(path, [...(byPath.get(path) ?? []), part])
    }
    const replacements = byPath.size === 1 ? replacementsOf(raw) : undefined
    const changes: Array<PatchFile> = []
    for (const [path, parts] of byPath) {
      const before = yield* readInside(path)
      const snippets = () =>
        parts.map((part) => acpPatchFile(path, part.oldText, part.newText ?? ""))
      if (parts.every((part) => part.oldText === null || part.oldText === undefined)) {
        changes.push(acpPatchFile(path, before, parts.at(-1)?.newText ?? ""))
        continue
      }
      if (before === undefined) {
        changes.push(...snippets())
        continue
      }
      const whole = parts.length === 1 && parts[0]?.oldText === before
      const after = whole
        ? (parts[0]?.newText ?? "")
        : ((replacements === undefined ? undefined : applyReplacements(before, replacements)) ??
          applyReplacements(
            before,
            parts.map((part) => ({ target: part.oldText ?? "", replacement: part.newText ?? "" })),
          ))
      if (after === undefined) changes.push(...snippets())
      else changes.push(acpPatchFile(path, before, after))
    }
    return { toolName: PATCH_TOOL, input: { changes } }
  })

export const antigravityProfile =
  (readFile: (path: string) => Effect.Effect<string | undefined>) =>
  (run: AcpRunContext): AcpProfile => ({
    product: ANTIGRAVITY_PRODUCT,
    settings: [{ id: MODE_OPTION, value: ANTIGRAVITY_SUPERVISED_MODE }],
    mode: ANTIGRAVITY_SUPERVISED_MODE,
    sessionMeta: (agent) =>
      antigravityTakesSystemPrompt(agent)
        ? { antigravity: { systemPrompt: { append: systemPromptAppend(run.offersOpenThread) } } }
        : undefined,
    question: (call) => call.toolCallId.startsWith(QUESTION_PREFIX),
    toolCall: (call) =>
      Effect.gen(function* () {
        const mcp = antigravityMcpTool(call, run.mcpServers)
        if (mcp !== undefined) return mcp
        return call.kind === "edit" ? yield* antigravityEdit(call, run.cwd, readFile) : undefined
      }),
  })

export class Antigravity extends Context.Service<
  Antigravity,
  {
    readonly executable: () => string
    readonly home: string
    readonly connect: AcpConnect
    readonly profile: (run: AcpRunContext) => AcpProfile
    readonly probe: (geminiHome?: string) => Effect.Effect<AntigravityProbe, AcpFailed>
  }
>()("humanity/Antigravity") {
  static readonly layer = Layer.effect(
    Antigravity,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const fs = yield* FileSystem.FileSystem
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      )
      const home = env["GEMINI_HOME"] ?? join(homedir(), ".gemini")
      const launch = () => locateCli(CLI_COMMANDS.antigravity)
      const executable = () => launch()?.path ?? CLI_COMMANDS.antigravity
      const notInstalled = () =>
        new AcpFailed({
          reason: new CliNotInstalled({
            product: ANTIGRAVITY_PRODUCT,
            command: CLI_COMMANDS.antigravity,
            installUrl: CLI_INSTALL_URLS.antigravity,
          }).message,
        })
      const envFor = (geminiHome: string | undefined) => ({
        ...env,
        AGY_CLI_DISABLE_AUTO_UPDATE: "1",
        ...(geminiHome === undefined
          ? {}
          : { GEMINI_HOME: geminiHome, AGY_ACP_FORCE_FILE_STORAGE: "1" }),
      })

      const readFile = (path: string) =>
        fs.readFileString(path).pipe(Effect.orElseSucceed(() => undefined))

      const checkSettings = (geminiHome: string | undefined) =>
        Effect.gen(function* () {
          const path = antigravitySettingsPath(geminiHome ?? home)
          const problem = antigravitySettingsProblem(yield* readFile(path), path)
          if (problem !== undefined) return yield* new AcpFailed({ reason: problem })
        })

      const connect: AcpConnect = (options) =>
        Effect.gen(function* () {
          const found = launch()
          if (found === undefined) return yield* notInstalled()
          yield* checkSettings(options.configDir)
          return yield* connectAcp({
            product: ANTIGRAVITY_PRODUCT,
            executable: found.command,
            args: [...found.args, ...ANTIGRAVITY_ARGS],
            cwd: options.cwd,
            env: envFor(options.configDir),
            onRequest: options.onRequest,
            onNotification: options.onNotification,
          })
        }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner))

      const collect = (stream: Stream.Stream<Uint8Array, unknown>) =>
        stream.pipe(Stream.decodeText(), Stream.mkString)

      const cli = (geminiHome: string | undefined, args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const found = launch()
          if (found === undefined) return yield* notInstalled()
          const handle = yield* spawner.spawn(
            ChildProcess.make(found.command, [...found.args, ...args], {
              env: envFor(geminiHome),
              stdin: "ignore",
            }),
          )
          const [stdout, stderr, exitCode] = yield* Effect.all(
            [collect(handle.stdout), collect(handle.stderr), handle.exitCode],
            { concurrency: "unbounded" },
          )
          return { stdout, stderr, exitCode: Number(exitCode) }
        }).pipe(
          Effect.scoped,
          Effect.mapError((cause) =>
            cause instanceof AcpFailed
              ? cause
              : new AcpFailed({ reason: `Antigravity could not be started: ${String(cause)}` }),
          ),
          Effect.timeoutOrElse({
            duration: PROBE_TIMEOUT,
            orElse: () =>
              Effect.fail(
                new AcpFailed({ reason: `Antigravity did not answer within ${PROBE_TIMEOUT}.` }),
              ),
          }),
        )

      const probe = (geminiHome?: string) =>
        Effect.gen(function* () {
          const version = yield* cli(geminiHome, ["--version"])
          const listed = yield* cli(geminiHome, ["models"])
          const signedIn = antigravitySignedIn(listed)
          if (signedIn === undefined) {
            const said = (listed.stderr.trim() || listed.stdout.trim()).slice(0, 300)
            return yield* new AcpFailed({
              reason: `Antigravity did not list its models (agy models).${said === "" ? "" : `\n${said}`}`,
            })
          }
          return {
            cliVersion: parseCliVersion(`${version.stdout}\n${version.stderr}`) ?? null,
            geminiHome: geminiHome ?? home,
            signedIn,
            models: signedIn ? antigravityModelsFromList(listed.stdout) : [],
          } satisfies AntigravityProbe
        })

      return { executable, home, connect, profile: antigravityProfile(readFile), probe }
    }),
  )

  static readonly layerTest = (
    options: { readonly probe?: Antigravity["Service"]["probe"] } = {},
  ) => {
    const unused = new AcpFailed({ reason: "Antigravity is not used by this test." })
    return Layer.succeed(Antigravity, {
      executable: () => "agy",
      home: "/home/me/.gemini",
      connect: () => Effect.fail(unused),
      profile: antigravityProfile(() => Effect.succeed(undefined)),
      probe: options.probe ?? (() => Effect.fail(unused)),
    })
  }
}
