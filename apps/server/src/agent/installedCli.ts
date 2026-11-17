import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { extname, posix, win32 } from "node:path"

/**
 * How to start a CLI the human installed. Humanity ships no agent of its own:
 * it runs the `claude`, `codex` or `kiro-cli` found on the PATH, the same one
 * the human signs in with in a terminal.
 */
export interface CliLaunch {
  /** The file that was found, as the human would recognise it. */
  readonly path: string
  /** What to spawn: the CLI's own executable, or `node` for a JavaScript one. */
  readonly command: string
  /** Arguments that go before the CLI's own: the script, when `command` is `node`. */
  readonly args: ReadonlyArray<string>
  /** The CLI's JavaScript entry point, when it is one. */
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

const pathOf = (platform: NodeJS.Platform) => (platform === "win32" ? win32 : posix)

/** Windows names the variable `Path`; any casing works there. */
const envValue = (env: LocateOptions["env"], name: string, platform: NodeJS.Platform) => {
  if (platform !== "win32") return env[name]
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

/**
 * Where to look: the PATH first, then the folders the CLIs' own installers
 * use, so an app started outside a terminal still finds them.
 */
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
            local === undefined ? [] : [path.join(local, "Kiro-Cli")],
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

/** The first file named `command` in the search folders, with Windows' executable extensions. */
export const findCommand = (command: string, options: LocateOptions): string | undefined => {
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
      if (options.exists(candidate)) return candidate
    }
  }
  return undefined
}

/**
 * The file an npm `.cmd` shim starts, relative to the shim: npm writes it as
 * `"%dp0%\node_modules\…\cli.js" %*`, the last quoted `%dp0%` path of the file.
 */
export const shimTarget = (shim: string): string | undefined => {
  const targets = [...shim.matchAll(/"%~?dp0%?\\([^"]+)"/g)].map((match) => match[1])
  return targets.at(-1)
}

const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs"])

/**
 * How to start the file found for a CLI. A Windows `.cmd` cannot be spawned
 * without a shell, so the npm shim is read for the script or executable it
 * runs. `undefined` when the file cannot be started that way.
 */
export const launchFor = (found: string, options: LocateOptions): CliLaunch | undefined => {
  const path = pathOf(options.platform)
  const extension = extname(found).toLowerCase()
  if (options.platform === "win32" && (extension === ".cmd" || extension === ".bat")) {
    const shim = options.readFile(found)
    const relative = shim === undefined ? undefined : shimTarget(shim)
    if (relative === undefined) return undefined
    const target = path.join(path.dirname(found), relative)
    if (!options.exists(target)) return undefined
    const launch = launchFor(target, options)
    return launch === undefined ? undefined : { ...launch, path: found }
  }
  if (options.platform === "win32" && extension === ".ps1") return undefined
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return { path: found, command: "node", args: [found], script: found }
  }
  return { path: found, command: found, args: [], script: undefined }
}

/** Finds a CLI and how to start it; `undefined` when it is not installed. */
export const locateCli = (
  command: string,
  options: LocateOptions = systemLocateOptions(),
): CliLaunch | undefined => {
  const found = findCommand(command, options)
  return found === undefined ? undefined : launchFor(found, options)
}

/** The first `x.y.z` version in what a CLI printed for `--version`. */
export const parseCliVersion = (output: string): string | undefined =>
  /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(output)?.[0]

/**
 * Orders `x.y.z` versions numerically; a pre-release comes before its release.
 * Negative when `a` is older than `b`.
 */
export const compareVersions = (a: string, b: string): number => {
  const parse = (version: string) => {
    const [core = "", pre] = version.split("-", 2)
    return { parts: core.split(".").map((part) => Number.parseInt(part, 10) || 0), pre }
  }
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < Math.max(left.parts.length, right.parts.length); index++) {
    const difference = (left.parts[index] ?? 0) - (right.parts[index] ?? 0)
    if (difference !== 0) return difference
  }
  if (left.pre === right.pre) return 0
  if (left.pre === undefined) return 1
  if (right.pre === undefined) return -1
  return left.pre < right.pre ? -1 : 1
}

/** True when `version` is known and older than `minimum`. */
export const isOutdated = (version: string | null, minimum: string | null): boolean =>
  version !== null && minimum !== null && compareVersions(version, minimum) < 0
