import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Daemon } from "./Daemon.ts"
import { ServerConfig } from "./ServerConfig.ts"

// `npm run dev` passes --dev: Vite serves the web app and proxies /rpc to the daemon.
const isDev = process.argv.includes("--dev")
const builtWeb = fileURLToPath(new URL("../../web/dist", import.meta.url))

const Config = ServerConfig.fromEnv({
  webDist: !isDev && existsSync(builtWeb) ? builtWeb : undefined,
  webOrigin: isDev ? "http://127.0.0.1:5173" : undefined,
}).pipe(Layer.provide(NodeServices.layer))

Daemon.pipe(Layer.provide(Config), Layer.launch, NodeRuntime.runMain)
