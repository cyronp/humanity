import type { KiroModel } from "@humanity/contracts"
import { Context, Effect, Layer, Option, Result } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { homedir } from "node:os"
import { join } from "node:path"
import { type AgentMessage, AcpFailed, connectAcp } from "../acp/Connection.ts"
import { decode, SessionResponse } from "../acp/protocol.ts"
import type { AcpConnect, AcpProfile } from "../agent/AcpRunner.ts"
import { ServerConfig } from "../ServerConfig.ts"

/**
 * Kiro (Beta) runs as the Kiro CLI's Agent Client Protocol server, `kiro-cli
 * acp`, which Humanity starts and speaks to over standard input and output.
 *
 * The flags are the ones Kiro's V3 migration guide asks clients to send:
 * `--agent-engine=v3` (Kiro 3.0 starts V2 when it is left out) and
 * `--auth-method=cli`, so Kiro uses the login in its own folder. The
 * `autopilot` setting is never sent, so Kiro keeps asking before every call
 * that is not a read, and Humanity answers each with `allow_once` only. Kiro's
 * own saved rules (`~/.kiro/settings/permissions.yaml`) are not checked by
 * Humanity; see the Beta notes in `docs/spec.md`.
 */
export const KIRO_PRODUCT = "Kiro"
export const KIRO_ARGS: ReadonlyArray<string> = ["acp", "--agent-engine=v3", "--auth-method=cli"]

/** Kiro's answer when it reads an account: whether it is signed in and what it offers. */
export interface KiroProbe {
  readonly cliVersion: string | null
  readonly kiroHome: string
  readonly signedIn: boolean
  readonly models: ReadonlyArray<KiroModel>
}

/** Humanity's permission check decides every call, so Kiro never gets a say of its own. */
export const kiroProfile: AcpProfile = { product: KIRO_PRODUCT }

const PROBE_TIMEOUT = "30 seconds"
/** Kiro says a sign-in is needed in these words when it refuses a request. */
const SIGNED_OUT = /\b(auth|sign ?in|log ?in|login)\b/i

const decodeSession = decode(SessionResponse)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The values of the model setting, as Kiro lists them; anything it leaves out is skipped. */
export const kiroModels = (
  options:
    | ReadonlyArray<{
        readonly id: string
        readonly category?: string | null | undefined
        readonly options?: unknown
      }>
    | null
    | undefined,
): ReadonlyArray<KiroModel> => {
  const model = options?.find((option) => option.category === "model" || option.id === "model")
  if (model === undefined || !Array.isArray(model.options)) return []
  return model.options.flatMap((choice): ReadonlyArray<KiroModel> => {
    if (!isRecord(choice) || typeof choice["value"] !== "string") return []
    const value = choice["value"]
    const name = choice["name"]
    const description = choice["description"]
    return [
      {
        value,
        displayName: typeof name === "string" ? name : value,
        description: typeof description === "string" ? description : "",
      },
    ]
  })
}

const refuse = (request: AgentMessage) =>
  Effect.fail(
    new AcpFailed({
      reason: `Humanity does not answer ${request.method} while it reads Kiro's account.`,
      unsupported: true,
    }),
  )

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
    /** Starts Kiro just long enough to open a session and read its models. Sends no prompt. */
    readonly probe: (kiroHome?: string) => Effect.Effect<KiroProbe, AcpFailed>
  }
>()("humanity/Kiro") {
  static readonly layer = Layer.effect(
    Kiro,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      )
      const home = env["KIRO_HOME"] ?? join(homedir(), ".kiro")
      const executable = "kiro-cli"

      const connect: AcpConnect = (options) =>
        connectAcp({
          product: KIRO_PRODUCT,
          executable,
          args: KIRO_ARGS,
          cwd: options.cwd,
          // An added account is a Kiro folder of its own; the default login is whatever Kiro finds.
          env: options.configDir === undefined ? env : { ...env, KIRO_HOME: options.configDir },
          onRequest: options.onRequest,
          onNotification: options.onNotification,
        }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner))

      /** Kiro in Humanity's own data directory, never the user's repository, to ask one thing. */
      const probe = (kiroHome?: string) =>
        Effect.scoped(
          Effect.gen(function* () {
            const connection = yield* connect({
              configDir: kiroHome,
              cwd: config.home,
              onRequest: refuse,
              onNotification: () => Effect.void,
            })
            const opened = yield* Effect.result(
              connection.request("session/new", { cwd: config.home, mcpServers: [] }),
            )
            if (Result.isFailure(opened)) {
              // Signed out, Kiro refuses every request with a sign-in message; anything else is a failure.
              if (SIGNED_OUT.test(opened.failure.reason)) {
                return {
                  cliVersion: connection.agent.agentInfo?.version ?? null,
                  kiroHome: kiroHome ?? home,
                  signedIn: false,
                  models: [],
                } satisfies KiroProbe
              }
              return yield* opened.failure
            }
            const session = decodeSession(opened.success)
            return {
              cliVersion: connection.agent.agentInfo?.version ?? null,
              kiroHome: kiroHome ?? home,
              signedIn: true,
              models: kiroModels(Option.getOrUndefined(session)?.configOptions),
            } satisfies KiroProbe
          }),
        ).pipe(
          Effect.timeoutOrElse({
            duration: PROBE_TIMEOUT,
            orElse: () =>
              Effect.fail(
                new AcpFailed({ reason: `Kiro did not answer within ${PROBE_TIMEOUT}.` }),
              ),
          }),
        )

      return { executable, home, connect, probe }
    }),
  )

  static readonly layerTest = (options: { readonly probe?: Kiro["Service"]["probe"] } = {}) => {
    const unused = new AcpFailed({ reason: "Kiro is not used by this test." })
    return Layer.succeed(Kiro, {
      executable: "kiro-cli",
      home: "/home/me/.kiro",
      connect: () => Effect.fail(unused),
      probe: options.probe ?? (() => Effect.fail(unused)),
    })
  }
}
