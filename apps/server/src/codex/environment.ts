import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

export const INHERITED_CODEX_VARIABLES: ReadonlyArray<string> = [
  "CODEX_THREAD_ID",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
]

export const codexEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !INHERITED_CODEX_VARIABLES.includes(key)) result[key] = value
  }
  return result
}

export const codexTargetTriple = (platform: NodeJS.Platform, arch: string): string | undefined => {
  const cpu = arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : undefined
  if (cpu === undefined) return undefined
  if (platform === "win32") return `${cpu}-pc-windows-msvc`
  if (platform === "darwin") return `${cpu}-apple-darwin`
  if (platform === "linux") return `${cpu}-unknown-linux-musl`
  return undefined
}

export const codexNativeExecutable = (
  script: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  exists: (path: string) => boolean = existsSync,
): string | undefined => {
  const triple = codexTargetTriple(platform, arch)
  if (triple === undefined) return undefined
  const binary = platform === "win32" ? "codex.exe" : "codex"
  const cli = dirname(dirname(script))
  const platformPackage = `codex-${platform}-${arch}`
  const packages = [
    join(cli, "node_modules", "@openai", platformPackage),
    join(dirname(cli), platformPackage),
    cli,
  ]
  for (const folder of packages) {
    const vendor = join(folder, "vendor", triple)
    for (const path of [join(vendor, "bin", binary), join(vendor, "codex", binary)]) {
      if (exists(path)) return path
    }
  }
  return undefined
}
