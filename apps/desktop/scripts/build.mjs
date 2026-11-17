// Builds everything the desktop app runs: its own main process and, unless
// `--main-only` is passed, the daemon it starts, staged in `dist/daemon`.
import { build } from "esbuild"
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const desktop = here("..")
const server = here("../../server")
const webDist = here("../../web/dist")
const daemonDir = join(desktop, "dist", "daemon")

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  // Workspace packages are bundled from their TypeScript sources.
  conditions: ["source"],
  sourcemap: true,
  logLevel: "info",
}

await build({
  ...shared,
  entryPoints: [join(desktop, "src", "main.ts")],
  outfile: join(desktop, "dist", "main.cjs"),
  format: "cjs",
  external: ["electron"],
  // The brand mark on the loading screen is the web app's favicon, inlined.
  loader: { ".svg": "text" },
})

if (!process.argv.includes("--main-only")) {
  if (!existsSync(join(webDist, "index.html"))) {
    throw new Error(`The web app is not built: ${webDist} is missing. Run "npm run build" first.`)
  }
  rmSync(daemonDir, { recursive: true, force: true })
  mkdirSync(daemonDir, { recursive: true })

  const sdk = "@anthropic-ai/claude-agent-sdk"
  await build({
    ...shared,
    entryPoints: [join(server, "src", "main.ts")],
    outfile: join(daemonDir, "main.mjs"),
    format: "esm",
    external: [sdk],
    // Bundled CommonJS dependencies call `require` for Node's built-ins.
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);',
    },
  })

  // Only the SDK's JavaScript ships. Its optional platform packages hold a
  // Claude Code executable of their own (~330 MB), which Humanity never runs:
  // threads run on the CLIs the human installed (`claude`, `codex`, `kiro-cli`).
  const require = createRequire(join(server, "package.json"))
  let sdkDir = dirname(require.resolve(sdk))
  while (!existsSync(join(sdkDir, "package.json"))) sdkDir = dirname(sdkDir)
  cpSync(sdkDir, join(daemonDir, "node_modules", sdk), { recursive: true, dereference: true })

  cpSync(webDist, join(daemonDir, "web"), { recursive: true })
  console.log(`Staged the daemon in ${daemonDir}`)
}
