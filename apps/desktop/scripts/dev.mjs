// `npm run dev:desktop`: opens the desktop window on the daemon and the Vite
// dev server that `npm run dev` runs next to it.
import electron from "electron"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const desktop = fileURLToPath(new URL("..", import.meta.url))

const run = (command, args, env) =>
  new Promise((resolve) => {
    spawn(command, args, { cwd: desktop, env, stdio: "inherit" }).on("exit", (code) =>
      resolve(code ?? 1),
    )
  })

const built = await run(process.execPath, ["scripts/build.mjs", "--main-only"], process.env)
if (built !== 0) process.exit(built)

// Outside Electron, the package's default export is the path of its executable.
const env = { ...process.env, HUMANITY_DESKTOP_DEV: "1" }
delete env.ELECTRON_RUN_AS_NODE
process.exit(await run(electron, ["."], env))
