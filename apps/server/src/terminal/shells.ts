import type { ShellInfo } from "@humanity/contracts"
import { existsSync, lstatSync } from "node:fs"
import { win32 } from "node:path"
import { findCommand, type LocateOptions, systemLocateOptions } from "../agent/installedCli.ts"

export type ShellKind = "pwsh" | "powershell" | "cmd" | "bash" | "zsh" | "fish" | "sh" | "wsl"

export interface Shell extends ShellInfo {
  readonly kind: ShellKind
}

const kindOf = (path: string): ShellKind | undefined => {
  const name = (path.split(/[\\/]/).at(-1) ?? "").toLowerCase().replace(/\.exe$/, "")
  switch (name) {
    case "pwsh":
    case "powershell":
    case "cmd":
    case "bash":
    case "zsh":
    case "fish":
    case "sh":
    case "wsl":
      return name
    default:
      return undefined
  }
}

const NAMES: Record<ShellKind, string> = {
  pwsh: "PowerShell",
  powershell: "Windows PowerShell",
  cmd: "Command Prompt",
  bash: "bash",
  zsh: "zsh",
  fish: "fish",
  sh: "sh",
  wsl: "WSL",
}

const envValue = (env: LocateOptions["env"], name: string) => {
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

const gitBash = (options: LocateOptions): string | undefined => {
  const candidates: Array<string> = []
  const git = findCommand("git", options)
  if (git !== undefined) {
    const root = win32.dirname(win32.dirname(git))
    candidates.push(win32.join(root, "bin", "bash.exe"))
  }
  for (const variable of ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"]) {
    const folder = envValue(options.env, variable.toUpperCase())
    if (folder !== undefined) candidates.push(win32.join(folder, "Git", "bin", "bash.exe"))
  }
  const local = envValue(options.env, "LOCALAPPDATA")
  if (local !== undefined) candidates.push(win32.join(local, "Programs", "Git", "bin", "bash.exe"))
  return candidates.find((candidate) => options.exists(candidate))
}

const windowsShells = (options: LocateOptions): Array<Shell> => {
  const shells: Array<Shell> = []
  const add = (id: string, kind: ShellKind, path: string | undefined, name = NAMES[kind]) => {
    if (path !== undefined) shells.push({ id, kind, name, path })
  }
  add("pwsh", "pwsh", findCommand("pwsh", options))
  add("powershell", "powershell", findCommand("powershell", options))
  add("git-bash", "bash", gitBash(options), "Git Bash")
  add("cmd", "cmd", envValue(options.env, "COMSPEC") ?? findCommand("cmd", options))
  add("wsl", "wsl", findCommand("wsl", options))
  return shells
}

const unixShells = (options: LocateOptions, etcShells: string | undefined): Array<Shell> => {
  const paths = [
    options.env["SHELL"],
    ...(etcShells ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("/")),
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
  ]
  const shells: Array<Shell> = []
  for (const path of paths) {
    if (path === undefined || path === "" || !options.exists(path)) continue
    const kind = kindOf(path)
    if (kind === undefined || shells.some((shell) => shell.kind === kind)) continue
    shells.push({ id: kind, kind, name: NAMES[kind], path })
  }
  return shells
}

const existsOrAlias = (path: string) => {
  if (existsSync(path)) return true
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

export const shellLocateOptions = (): LocateOptions => ({
  ...systemLocateOptions(),
  exists: existsOrAlias,
})

export const detectShells = (options: LocateOptions): ReadonlyArray<Shell> =>
  options.platform === "win32"
    ? windowsShells(options)
    : unixShells(options, options.readFile("/etc/shells"))

export const pickShell = (
  shells: ReadonlyArray<Shell>,
  wanted: string | null | undefined,
): Shell | undefined =>
  (wanted === null || wanted === undefined
    ? undefined
    : shells.find((shell) => shell.id === wanted)) ?? shells[0]

export const isWindowsPath = (path: string) =>
  /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\")
