import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

/**
 * Variables a parent Codex session sets for its own children. If the daemon
 * itself was started from inside Codex, passing these on would make the
 * agent's CLI believe it runs inside that session.
 */
export const INHERITED_CODEX_VARIABLES: ReadonlyArray<string> = [
  "CODEX_THREAD_ID",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
]

/**
 * The environment Codex runs with. Everything else is passed through
 * unchanged, in particular `CODEX_HOME` (where its login lives) and any
 * `OPENAI_*` credential the human configured. Humanity never reads or stores
 * those values; Codex does.
 */
export const codexEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !INHERITED_CODEX_VARIABLES.includes(key)) result[key] = value
  }
  return result
}

/** The Rust target a platform's Codex executable is built for, as its package names the folder. */
export const codexTargetTriple = (platform: NodeJS.Platform, arch: string): string | undefined => {
  const cpu = arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : undefined
  if (cpu === undefined) return undefined
  if (platform === "win32") return `${cpu}-pc-windows-msvc`
  if (platform === "darwin") return `${cpu}-apple-darwin`
  if (platform === "linux") return `${cpu}-unknown-linux-musl`
  return undefined
}

/**
 * The Codex executable that ships with the `@openai/codex` package: an
 * optional package per platform, installed next to it. `null` when it is missing.
 */
export const bundledCodexExecutable = (
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | null => {
  const triple = codexTargetTriple(platform, arch)
  if (triple === undefined) return null
  const binary = platform === "win32" ? "codex.exe" : "codex"
  try {
    const cli = createRequire(import.meta.url).resolve("@openai/codex/package.json")
    // The platform package is the CLI's dependency, so it resolves from there.
    const platformPackage = createRequire(cli).resolve(
      `@openai/codex-${platform}-${arch}/package.json`,
    )
    const vendor = join(dirname(platformPackage), "vendor", triple)
    for (const path of [join(vendor, "bin", binary), join(vendor, "codex", binary)]) {
      if (existsSync(path)) return path
    }
  } catch {
    // Not installed for this platform.
  }
  return null
}
