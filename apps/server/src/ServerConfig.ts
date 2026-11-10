import { DEFAULT_DAEMON_PORT } from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer } from "effect"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

export interface ServerConfigShape {
  /** Data directory. Everything Humanity writes lives under it (or in a session worktree inside it). */
  readonly home: string
  /** The daemon only ever binds to loopback in the MVP. */
  readonly host: "127.0.0.1"
  readonly port: number
  readonly databasePath: string
  readonly worktreesDir: string
  readonly reposDir: string
  readonly authTokenPath: string
  /** `CLAUDE_CONFIG_DIR` for the Agent SDK, so its transcripts stay inside the data directory. */
  readonly claudeConfigDir: string
  /** Built web assets served in production. `undefined` when they should not be served. */
  readonly webDist: string | undefined
  /** Origin the human should open. Differs from the daemon's own in development (Vite). */
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
    authTokenPath: join(home, "auth-token"),
    claudeConfigDir: join(home, "claude"),
    webDist: options.webDist,
    webOrigin: options.webOrigin ?? `http://127.0.0.1:${options.port}`,
  }
}

export class ServerConfig extends Context.Service<ServerConfig, ServerConfigShape>()(
  "humanity/ServerConfig",
) {
  /** Creates the data directories so every other service can assume they exist. */
  static readonly layer = (options: Parameters<typeof make>[0]) =>
    Layer.effect(
      ServerConfig,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const config = make(options)
        yield* fs.makeDirectory(config.worktreesDir, { recursive: true })
        yield* fs.makeDirectory(config.reposDir, { recursive: true })
        yield* fs.makeDirectory(config.claudeConfigDir, { recursive: true })
        return config
      }).pipe(Effect.orDie),
    )

  /** `HUMANITY_HOME` and `HUMANITY_PORT` override the defaults. */
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
