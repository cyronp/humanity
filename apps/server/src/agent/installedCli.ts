import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { extname, posix, win32 } from "node:path"

export interface CliLaunch {
  readonly path: string
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly script: string | undefined
}

export interface LocateOptions {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly platform: NodeJS.Platform
  readonly home: string
  readonly exists: (path: string) => boolean
  readonly readFile: (path: string) => string | undefined
}

export const systemLocateOptions = (): LocateOptions => ({
  env: process.env,
  platform: process.platform,
  home: homedir(),
  exists: existsSync,
  readFile: (path) => {
    try {
      return readFileSync(path, "utf8")
    } catch {
      return undefined
    }
  },
})

const NODE = "node"

const pathOf = (platform: NodeJS.Platform) => (platform === "win32" ? win32 : posix)

const envValue = (env: LocateOptions["env"], name: string, platform: NodeJS.Platform) => {
  if (platform !== "win32") return env[name]
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

export const searchFolders = (options: LocateOptions): ReadonlyArray<string> => {
  const { env, platform, home } = options
  const path = pathOf(platform)
  const separator = platform === "win32" ? ";" : ":"
  const fromPath = (envValue(env, "PATH", platform) ?? "")
    .split(separator)
    .map((folder) => folder.trim().replace(/^"(.*)"$/, "$1"))
    .filter((folder) => folder !== "")
  const usual =
    platform === "win32"
      ? [
          path.join(home, ".local", "bin"),
          ...[envValue(env, "APPDATA", platform)].flatMap((appData) =>
            appData === undefined ? [] : [path.join(appData, "npm")],
          ),
          ...[envValue(env, "LOCALAPPDATA", platform)].flatMap((local) =>
            local === undefined
              ? []
              : [path.join(local, "Kiro-Cli"), path.join(local, "agy", "bin")],
          ),
        ]
      : [
          path.join(home, ".local", "bin"),
          path.join(home, ".claude", "local"),
          "/opt/homebrew/bin",
          "/usr/local/bin",
        ]
  return [...new Set([...fromPath, ...usual])]
}

export function* findCommands(command: string, options: LocateOptions): Generator<string> {
  const path = pathOf(options.platform)
  const extensions =
    options.platform === "win32"
      ? (envValue(options.env, "PATHEXT", "win32") ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter((extension) => extension !== "")
          .map((extension) => extension.toLowerCase())
      : [""]
  for (const folder of searchFolders(options)) {
    for (const extension of extensions) {
      const candidate = path.join(folder, `${command}${extension}`)
      if (options.exists(candidate)) yield candidate
    }
  }
}

export const findCommand = (command: string, options: LocateOptions): string | undefined => {
  for (const found of findCommands(command, options)) return found
  return undefined
}

export const shimTarget = (shim: string): string | undefined => {
  const targets = [...shim.matchAll(/"%~?dp0%?\\([^"]+)"/g)].map((match) => match[1])
  return targets.at(-1)
}

const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs"])

const runtimeFor = (shim: string | undefined, options: LocateOptions): string => {
  if (shim !== undefined) {
    const path = pathOf(options.platform)
    const beside = path.join(path.dirname(shim), options.platform === "win32" ? "node.exe" : NODE)
    if (options.exists(beside)) return beside
  }
  return findCommand(NODE, options) ?? NODE
}

export const launchFor = (
  found: string,
  options: LocateOptions,
  shim?: string,
): CliLaunch | undefined => {
  const path = pathOf(options.platform)
  const extension = extname(found).toLowerCase()
  if (options.platform === "win32" && (extension === ".cmd" || extension === ".bat")) {
    if (shim !== undefined) return undefined
    const content = options.readFile(found)
    const relative = content === undefined ? undefined : shimTarget(content)
    if (relative === undefined) return undefined
    const target = path.join(path.dirname(found), relative)
    if (!options.exists(target)) return undefined
    const launch = launchFor(target, options, found)
    return launch === undefined ? undefined : { ...launch, path: found }
  }
  if (options.platform === "win32" && extension === ".ps1") return undefined
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return { path: found, command: runtimeFor(shim, options), args: [found], script: found }
  }
  return { path: found, command: found, args: [], script: undefined }
}

export const findLaunch = (command: string, options: LocateOptions): CliLaunch | undefined => {
  for (const found of findCommands(command, options)) {
    const launch = launchFor(found, options)
    if (launch !== undefined) return launch
  }
  return undefined
}

export const locateCli = (
  command: string,
  options: LocateOptions = systemLocateOptions(),
): CliLaunch | undefined => findLaunch(command, options)

export const parseCliVersion = (output: string): string | undefined =>
  /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(output)?.[0]

const parseVersion = (version: string) => {
  const withoutBuild = version.split("+", 1)[0] ?? ""
  const dash = withoutBuild.indexOf("-")
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash)
  return {
    parts: core.split(".").map((part) => Number.parseInt(part, 10) || 0),
    pre: dash === -1 ? undefined : withoutBuild.slice(dash + 1).split("."),
  }
}

const NUMERIC = /^\d+$/

const comparePrerelease = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): number => {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index]
    const b = right[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    const aNumeric = NUMERIC.test(a)
    const bNumeric = NUMERIC.test(b)
    if (aNumeric && bNumeric) {
      const difference = Number(a) - Number(b)
      if (difference !== 0) return difference
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1
    } else if (a !== b) {
      return a < b ? -1 : 1
    }
  }
  return 0
}

export const compareVersions = (a: string, b: string): number => {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let index = 0; index < Math.max(left.parts.length, right.parts.length); index++) {
    const difference = (left.parts[index] ?? 0) - (right.parts[index] ?? 0)
    if (difference !== 0) return difference
  }
  if (left.pre === undefined && right.pre === undefined) return 0
  if (left.pre === undefined) return 1
  if (right.pre === undefined) return -1
  return comparePrerelease(left.pre, right.pre)
}

export const isOutdated = (version: string | null, minimum: string | null): boolean =>
  version !== null && minimum !== null && compareVersions(version, minimum) < 0
