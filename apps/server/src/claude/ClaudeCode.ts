import { query, type Query } from "@anthropic-ai/claude-agent-sdk"
import type { ClaudeModel, PlanUsage } from "@humanity/contracts"
import { Context, Data, Effect, Layer } from "effect"
import { homedir } from "node:os"
import { ServerConfig } from "../ServerConfig.ts"
import type { ReportedAccount } from "./account.ts"
import { CLI_COMMANDS, CLI_INSTALL_URLS } from "@humanity/contracts"
import { locateCli } from "../agent/installedCli.ts"
import { claudeConfigDir, claudeEnvironment } from "./environment.ts"
import { readPlanUsage } from "./planUsage.ts"

export interface ProbeResult {
  readonly cliVersion: string | undefined
  readonly account: ReportedAccount | undefined
  readonly models: ReadonlyArray<ClaudeModel>
}

export class ClaudeProbeFailed extends Data.TaggedError("ClaudeProbeFailed")<{
  readonly reason: string
}> {}

const PROBE_TIMEOUT = "30 seconds"

async function* idlePrompt(signal: AbortSignal): AsyncGenerator<never> {
  if (signal.aborted) return
  await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()))
}

export const notInstalled = () =>
  new ClaudeProbeFailed({
    reason: `Claude Code is not installed: no "claude" command was found. Install it (${CLI_INSTALL_URLS["claude-code"]}), then check again.`,
  })

type Initialized = Awaited<ReturnType<Query["initializationResult"]>>

const lastLines = (chunks: ReadonlyArray<string>) =>
  chunks.join("").trim().split(/\r?\n/).slice(-3).join("\n")

const idleSession = <A>(
  cwd: string,
  env: Record<string, string>,
  executable: string | undefined,
  ask: (session: Query, init: Initialized) => Promise<A>,
) =>
  Effect.suspend(() => {
    if (executable === undefined) return Effect.fail(notInstalled())
    const stderr: Array<string> = []
    return Effect.tryPromise({
      try: async (signal) => {
        const abortController = new AbortController()
        const stop = () => abortController.abort()
        signal.addEventListener("abort", stop)
        const session = query({
          prompt: idlePrompt(abortController.signal),
          options: {
            cwd,
            env,
            pathToClaudeCodeExecutable: executable,
            abortController,
            permissionMode: "default",
            allowedTools: [],
            mcpServers: {},
            strictMcpConfig: true,
            settingSources: [],
            persistSession: false,
            stderr: (data) => {
              stderr.push(data)
            },
          },
        })
        try {
          const init = await session.initializationResult()
          return await ask(session, init)
        } finally {
          signal.removeEventListener("abort", stop)
          session.close()
          stop()
        }
      },
      catch: (cause) => {
        const message = cause instanceof Error ? cause.message : String(cause)
        const detail = lastLines(stderr)
        return new ClaudeProbeFailed({
          reason: detail === "" ? message : `${message}\n${detail}`,
        })
      },
    })
  }).pipe(
    Effect.timeoutOrElse({
      duration: PROBE_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new ClaudeProbeFailed({
            reason: `Claude Code did not answer within ${PROBE_TIMEOUT}.`,
          }),
        ),
    }),
  )

const probe = (cwd: string, env: Record<string, string>, executable: string | undefined) =>
  idleSession(cwd, env, executable, (_session, init): Promise<ProbeResult> =>
    Promise.resolve({
      cliVersion: init.claude_code_version,
      account: init.account,
      models: (init.models ?? []).map(({ value, displayName, description }) => ({
        value,
        displayName,
        description,
      })),
    }),
  )

const planUsage = (cwd: string, env: Record<string, string>, executable: string | undefined) =>
  idleSession(cwd, env, executable, async (session) =>
    readPlanUsage(
      await session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
        skipBehaviors: true,
      }),
    ),
  )

export class ClaudeCode extends Context.Service<
  ClaudeCode,
  {
    readonly configDir: string
    readonly executable: () => string | undefined
    readonly environment: Record<string, string>
    readonly probe: (configDir?: string) => Effect.Effect<ProbeResult, ClaudeProbeFailed>
    readonly planUsage: (
      configDir?: string,
    ) => Effect.Effect<PlanUsage | undefined, ClaudeProbeFailed>
  }
>()("humanity/ClaudeCode") {
  static readonly layer = Layer.effect(
    ClaudeCode,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      const environment = claudeEnvironment(process.env)
      const executable = () => {
        const found = locateCli(CLI_COMMANDS["claude-code"])
        return found?.script ?? found?.command
      }
      const envFor = (configDir: string | undefined) =>
        configDir === undefined ? environment : { ...environment, CLAUDE_CONFIG_DIR: configDir }
      return {
        configDir: claudeConfigDir(process.env, homedir()),
        executable,
        environment,
        probe: (configDir) => probe(config.home, envFor(configDir), executable()),
        planUsage: (configDir) => planUsage(config.home, envFor(configDir), executable()),
      }
    }),
  )

  static readonly layerTest = (
    probe:
      | Effect.Effect<ProbeResult, ClaudeProbeFailed>
      | ((configDir?: string) => Effect.Effect<ProbeResult, ClaudeProbeFailed>),
    options: {
      readonly configDir?: string
      readonly bundledExecutable?: string | null
      readonly planUsage?: (
        configDir?: string,
      ) => Effect.Effect<PlanUsage | undefined, ClaudeProbeFailed>
    } = {},
  ) =>
    Layer.succeed(ClaudeCode, {
      configDir: options.configDir ?? "/home/test/.claude",
      executable: () => "/usr/local/bin/claude",
      environment: {},
      probe: typeof probe === "function" ? probe : () => probe,
      planUsage: options.planUsage ?? (() => Effect.succeed(undefined)),
    })
}
