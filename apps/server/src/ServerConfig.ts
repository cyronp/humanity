import { DEFAULT_DAEMON_PORT } from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer } from "effect"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

export interface ServerConfigShape {
  readonly home: string
  readonly host: "127.0.0.1"
  readonly port: number
  readonly databasePath: string
  readonly worktreesDir: string
  readonly reposDir: string
  readonly attachmentsDir: string
  readonly accountsDir: string
  readonly codexAccountsDir: string
  readonly kiroAccountsDir: string
  readonly antigravityAccountsDir: string
  readonly authTokenPath: string
  readonly githubTokenPath: string
  readonly gitlabTokenPath: string
  readonly gitlabHostPath: string
  readonly mcpConfigPath: string
  readonly pluginDir: string
  readonly terminalsDir: string
  readonly checkpointsDir: string
  readonly shellIntegrationDir: string
  readonly webDist: string | undefined
  readonly webOrigin: string
}

const make = (options: {
  readonly home: string
  readonly port: number
  readonly webDist?: string | undefined
  readonly webOrigin?: string | undefined
}): ServerConfigShape => {
  const home = resolve(options.home)
  return {
    home,
    host: "127.0.0.1",
    port: options.port,
    databasePath: join(home, "humanity.db"),
    worktreesDir: join(home, "worktrees"),
    reposDir: join(home, "repos"),
    attachmentsDir: join(home, "attachments"),
    accountsDir: join(home, "accounts"),
    codexAccountsDir: join(home, "codex-accounts"),
    kiroAccountsDir: join(home, "kiro-accounts"),
    antigravityAccountsDir: join(home, "antigravity-accounts"),
    authTokenPath: join(home, "auth-token"),
    githubTokenPath: join(home, "github-token"),
    gitlabTokenPath: join(home, "gitlab-token"),
    gitlabHostPath: join(home, "gitlab-host"),
    mcpConfigPath: join(home, "mcp.json"),
    pluginDir: join(home, "plugin"),
    terminalsDir: join(home, "terminals"),
    checkpointsDir: join(home, "checkpoints"),
    shellIntegrationDir: join(home, "shell-integration"),
    webDist: options.webDist,
    webOrigin: options.webOrigin ?? `http://127.0.0.1:${options.port}`,
  }
}

export class ServerConfig extends Context.Service<ServerConfig, ServerConfigShape>()(
  "humanity/ServerConfig",
) {
  static readonly layer = (options: Parameters<typeof make>[0]) =>
    Layer.effect(
      ServerConfig,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const config = make(options)
        yield* fs.makeDirectory(config.worktreesDir, { recursive: true })
        yield* fs.makeDirectory(config.reposDir, { recursive: true })
        yield* fs.makeDirectory(config.attachmentsDir, { recursive: true })
        yield* fs.makeDirectory(config.accountsDir, { recursive: true })
        yield* fs.makeDirectory(config.codexAccountsDir, { recursive: true })
        yield* fs.makeDirectory(config.kiroAccountsDir, { recursive: true })
        yield* fs.makeDirectory(config.antigravityAccountsDir, { recursive: true })
        return config
      }).pipe(Effect.orDie),
    )

  static readonly fromEnv = (options: {
    readonly webDist?: string | undefined
    readonly webOrigin?: string | undefined
  }) => {
    const port = Number(process.env["HUMANITY_PORT"] ?? DEFAULT_DAEMON_PORT)
    return ServerConfig.layer({
      home: process.env["HUMANITY_HOME"] ?? join(homedir(), ".humanity"),
      port: Number.isInteger(port) && port > 0 ? port : DEFAULT_DAEMON_PORT,
      ...options,
    })
  }
}
