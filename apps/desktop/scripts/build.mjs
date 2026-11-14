// Builds everything the desktop app runs: its own main process and, unless
// `--main-only` is passed, the daemon it starts, staged in `dist/daemon`.
import { build } from "esbuild"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
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

  // The Agent SDK finds the Claude Code executable next to itself, in a package
  // of its own per platform, so both stay on disk beside the bundle.
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

  const require = createRequire(join(server, "package.json"))
  let sdkDir = dirname(require.resolve(sdk))
  while (!existsSync(join(sdkDir, "package.json"))) sdkDir = dirname(sdkDir)
  const scope = dirname(sdkDir)
  const manifest = JSON.parse(readFileSync(join(sdkDir, "package.json"), "utf8"))
  // npm installs only the platform package of the machine that builds.
  const platformPackages = Object.keys(manifest.optionalDependencies ?? {})
    .map((name) => name.slice(name.indexOf("/") + 1))
    .filter((name) => existsSync(join(scope, name)))
  if (platformPackages.length === 0) {
    throw new Error(`No Claude Code executable is installed next to ${sdkDir}.`)
  }
  const staged = join(daemonDir, "node_modules", "@anthropic-ai")
  for (const name of [sdk.slice(sdk.indexOf("/") + 1), ...platformPackages]) {
    cpSync(join(scope, name), join(staged, name), { recursive: true, dereference: true })
  }

  cpSync(webDist, join(daemonDir, "web"), { recursive: true })
  console.log(`Staged the daemon in ${daemonDir} (${platformPackages.join(", ")})`)
}
