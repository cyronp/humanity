import { describe, expect, it } from "vitest"
import {
  compareVersions,
  findCommand,
  isOutdated,
  launchFor,
  type LocateOptions,
  locateCli,
  parseCliVersion,
  searchFolders,
  shimTarget,
} from "../src/agent/installedCli.ts"

const windows = (files: Record<string, string>, env: LocateOptions["env"] = {}): LocateOptions => ({
  env: {
    Path: "C:\\Tools;C:\\Users\\me\\AppData\\Roaming\\npm",
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    APPDATA: "C:\\Users\\me\\AppData\\Roaming",
    ...env,
  },
  platform: "win32",
  home: "C:\\Users\\me",
  exists: (path) => path in files,
  readFile: (path) => files[path],
})

const unix = (files: ReadonlyArray<string>, path = "/usr/bin:/bin"): LocateOptions => ({
  env: { PATH: path },
  platform: "linux",
  home: "/home/me",
  exists: (candidate) => files.includes(candidate),
  readFile: () => undefined,
})

const NPM_SHIM = [
  "@ECHO off",
  "SET dp0=%~dp0",
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ") ELSE (",
  '  SET "_prog=node"',
  ")",
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
].join("\r\n")

describe("finding an installed CLI", () => {
  it("looks on the PATH, then in the folders the installers use", () => {
    expect(searchFolders(unix([], "/usr/bin::/opt/bin"))).toEqual([
      "/usr/bin",
      "/opt/bin",
      "/home/me/.local/bin",
      "/home/me/.claude/local",
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ])
    expect(searchFolders(windows({}))).toContain("C:\\Users\\me\\.local\\bin")
  })

  it("finds a command on the PATH, or not at all", () => {
    expect(findCommand("claude", unix(["/bin/claude"]))).toBe("/bin/claude")
    expect(findCommand("claude", unix([]))).toBeUndefined()
  })

  it("finds the native Claude Code installer's folder even off the PATH", () => {
    const options = unix(["/home/me/.local/bin/claude"])
    expect(locateCli("claude", options)).toEqual({
      path: "/home/me/.local/bin/claude",
      command: "/home/me/.local/bin/claude",
      args: [],
      script: undefined,
    })
  })

  it("tries Windows' executable extensions in PATHEXT order, whatever the variables' case", () => {
    const options = windows({ "C:\\Tools\\kiro-cli.exe": "", "C:\\Tools\\kiro-cli.cmd": "" })
    expect(findCommand("kiro-cli", options)).toBe("C:\\Tools\\kiro-cli.exe")
  })

  it("runs the script behind an npm shim, which cannot be spawned itself", () => {
    const shim = "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd"
    const script =
      "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"
    expect(locateCli("codex", windows({ [shim]: NPM_SHIM, [script]: "" }))).toEqual({
      path: shim,
      command: "node",
      args: [script],
      script,
    })
  })

  it("gives up on a shim whose target is missing or unreadable", () => {
    const shim = "C:\\Tools\\codex.cmd"
    expect(launchFor(shim, windows({ [shim]: NPM_SHIM }))).toBeUndefined()
    expect(launchFor(shim, windows({ [shim]: "@echo off" }))).toBeUndefined()
  })

  it("reads the last quoted %dp0% path of a shim", () => {
    expect(shimTarget(NPM_SHIM)).toBe("node_modules\\@openai\\codex\\bin\\codex.js")
    expect(shimTarget('"%~dp0\\cli.js" %*')).toBe("cli.js")
  })
})

describe("CLI versions", () => {
  it("reads the version each CLI prints", () => {
    expect(parseCliVersion("2.1.326 (Claude Code)\n")).toBe("2.1.326")
    expect(parseCliVersion("codex-cli 0.155.1")).toBe("0.155.1")
    expect(parseCliVersion("kiro-cli 3.3.0")).toBe("3.3.0")
    expect(parseCliVersion("codex-cli 0.170.0-alpha.2")).toBe("0.170.0-alpha.2")
    expect(parseCliVersion("command not found")).toBeUndefined()
  })

  it("orders versions numerically, a pre-release before its release", () => {
    expect(compareVersions("0.169.0", "0.155.1")).toBeGreaterThan(0)
    expect(compareVersions("2.1.9", "2.1.10")).toBeLessThan(0)
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0)
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0)
  })

  it("calls a known version below the minimum outdated, and nothing else", () => {
    expect(isOutdated("0.155.1", "0.169.0")).toBe(true)
    expect(isOutdated("2.1.326", "2.1.321")).toBe(false)
    expect(isOutdated(null, "0.169.0")).toBe(false)
    expect(isOutdated("3.3.0", null)).toBe(false)
  })
})
