import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Daemon } from "./Daemon.ts"
import { ServerConfig } from "./ServerConfig.ts"

const isDev = process.argv.includes("--dev")
const builtWeb =
  process.env["HUMANITY_WEB_DIST"] ?? fileURLToPath(new URL("../../web/dist", import.meta.url))

const Config = ServerConfig.fromEnv({
  webDist: !isDev && existsSync(builtWeb) ? builtWeb : undefined,
  webOrigin: isDev ? "http://127.0.0.1:5173" : undefined,
}).pipe(Layer.provide(NodeServices.layer))

const parentGone = Effect.callback<void>((resume) => {
  const done = () => resume(Effect.void)
  process.stdin.once("end", done)
  process.stdin.once("close", done)
  process.stdin.resume()
})

const launch = Daemon.pipe(Layer.provide(Config), Layer.launch)

NodeRuntime.runMain(
  process.env["HUMANITY_EXIT_WITH_PARENT"] === "1" ? Effect.raceFirst(launch, parentGone) : launch,
)
