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

const packageDir = (require, name) => {
  let dir = dirname(require.resolve(name))
  while (!existsSync(join(dir, "package.json"))) dir = dirname(dir)
  return dir
}

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
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
  loader: { ".svg": "text" },
})

if (!process.argv.includes("--main-only")) {
  if (!existsSync(join(webDist, "index.html"))) {
    throw new Error(`The web app is not built: ${webDist} is missing. Run "npm run build" first.`)
  }
  rmSync(daemonDir, { recursive: true, force: true })
  mkdirSync(daemonDir, { recursive: true })

  const sdk = "@anthropic-ai/claude-agent-sdk"
  const pty = "node-pty"
  await build({
    ...shared,
    entryPoints: [join(server, "src", "main.ts")],
    outfile: join(daemonDir, "main.mjs"),
    format: "esm",
    external: [sdk, pty],
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);',
    },
  })

  const require = createRequire(join(server, "package.json"))
  const sdkDir = packageDir(require, sdk)
  cpSync(sdkDir, join(daemonDir, "node_modules", sdk), { recursive: true, dereference: true })

  const ptyDir = packageDir(require, pty)
  const ptyTarget = join(daemonDir, "node_modules", pty)
  const binaries = ["build/Release", `prebuilds/${process.platform}-${process.arch}`]
  if (!binaries.some((folder) => existsSync(join(ptyDir, folder)))) {
    throw new Error(`${pty} has no binary for ${process.platform}-${process.arch} in ${ptyDir}.`)
  }
  for (const part of ["package.json", "LICENSE", "lib", ...binaries]) {
    if (!existsSync(join(ptyDir, part))) continue
    cpSync(join(ptyDir, part), join(ptyTarget, part), {
      recursive: true,
      dereference: true,
      filter: (source) =>
        !/\.(pdb|map|ts|o|obj|lib|exp|ilk|iobj|ipdb|tlog)$/i.test(source) &&
        !/\.test\.js$/i.test(source) &&
        !/[\\/](obj|\.deps)[\\/]?/.test(source.slice(ptyDir.length)),
    })
  }

  cpSync(webDist, join(daemonDir, "web"), { recursive: true })
  console.log(`Staged the daemon in ${daemonDir}`)
}
