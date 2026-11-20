import { type AgentProvider, HUMANITY_PLUGIN_NAME, type SkillSource } from "@humanity/contracts"
import { Context } from "effect"
import { homedir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"
import { claudeConfigDir } from "../claude/environment.ts"

export interface CliHomesShape {
  readonly userHome: string
  readonly env: Readonly<Record<string, string | undefined>>
}

export const CliHomes = Context.Reference<CliHomesShape>("humanity/CliHomes", {
  defaultValue: () => ({ userHome: homedir(), env: process.env }),
})

export interface NativeReader {
  readonly provider: AgentProvider
  readonly defaultLogin: boolean
}

export interface SkillRoot {
  readonly dir: string
  readonly source: SkillSource
  readonly location: string
  readonly readBy: ReadonlyArray<NativeReader>
}

const always = (...providers: ReadonlyArray<AgentProvider>): ReadonlyArray<NativeReader> =>
  providers.map((provider) => ({ provider, defaultLogin: false }))

const ownLogin = (provider: AgentProvider): ReadonlyArray<NativeReader> => [
  { provider, defaultLogin: true },
]

const homeOr = (configured: string | undefined, fallback: string): string => {
  const trimmed = configured?.trim()
  return trimmed !== undefined && trimmed !== "" ? trimmed : fallback
}

export const shortPath = (path: string, userHome: string): string => {
  const inside = relative(resolve(userHome), resolve(path))
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return path
  return `~/${inside.split("\\").join("/")}`
}

export const humanitySkillRoot = (pluginDir: string): SkillRoot => ({
  dir: join(pluginDir, "skills"),
  source: "humanity",
  location: "Humanity",
  readBy: always("claude-code"),
})

export const projectSkillRoots = (projectPath: string): ReadonlyArray<SkillRoot> => [
  {
    dir: join(projectPath, ".claude", "skills"),
    source: "project",
    location: ".claude/skills",
    readBy: always("claude-code"),
  },
  {
    dir: join(projectPath, ".agents", "skills"),
    source: "project",
    location: ".agents/skills",
    readBy: always("codex", "antigravity"),
  },
  {
    dir: join(projectPath, ".agent", "skills"),
    source: "project",
    location: ".agent/skills",
    readBy: always("antigravity"),
  },
  {
    dir: join(projectPath, ".kiro", "skills"),
    source: "project",
    location: ".kiro/skills",
    readBy: always("kiro"),
  },
]

export interface ClaudePlugin {
  readonly id: string
  readonly installPath: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const enabledClaudePlugins = (
  settings: unknown,
  installed: unknown,
): ReadonlyArray<ClaudePlugin> => {
  const enabled = isRecord(settings) ? settings["enabledPlugins"] : undefined
  const plugins = isRecord(installed) ? installed["plugins"] : undefined
  if (!isRecord(enabled) || !isRecord(plugins)) return []
  return Object.entries(enabled).flatMap(([id, on]): Array<ClaudePlugin> => {
    if (on !== true) return []
    const entry = plugins[id]
    const entries = Array.isArray(entry) ? entry : [entry]
    const install = entries.find(
      (each) =>
        isRecord(each) &&
        typeof each["installPath"] === "string" &&
        (each["scope"] === undefined || each["scope"] === "user"),
    )
    return isRecord(install) && typeof install["installPath"] === "string"
      ? [{ id, installPath: install["installPath"] }]
      : []
  })
}

export const claudeDir = (homes: CliHomesShape): string =>
  claudeConfigDir(homes.env, homes.userHome)

export const userSkillRoots = (
  homes: CliHomesShape,
  claudePlugins: ReadonlyArray<ClaudePlugin>,
): ReadonlyArray<SkillRoot> => {
  const { userHome, env } = homes
  const codexHome = homeOr(env["CODEX_HOME"], join(userHome, ".codex"))
  const geminiHome = homeOr(env["GEMINI_HOME"], join(userHome, ".gemini"))
  const kiroHome = homeOr(env["KIRO_HOME"], join(userHome, ".kiro"))
  const user = (dir: string, readBy: ReadonlyArray<NativeReader>): SkillRoot => ({
    dir,
    source: "user",
    location: shortPath(dir, userHome),
    readBy,
  })
  return [
    user(join(claudeDir(homes), "skills"), ownLogin("claude-code")),
    ...claudePlugins.map((plugin): SkillRoot => ({
      dir: join(plugin.installPath, "skills"),
      source: "user",
      location: `Claude Code plugin ${plugin.id.split("@")[0] ?? plugin.id}`,
      readBy: ownLogin("claude-code"),
    })),
    user(join(userHome, ".agents", "skills"), always("codex")),
    user(join(codexHome, "skills"), ownLogin("codex")),
    user(join(geminiHome, "config", "skills"), ownLogin("antigravity")),
    user(join(geminiHome, "antigravity-cli", "skills"), ownLogin("antigravity")),
    user(join(geminiHome, "skills"), ownLogin("antigravity")),
    user(join(kiroHome, "skills"), ownLogin("kiro")),
  ]
}

export const skillInvocation = (name: string, root: SkillRoot): string =>
  root.source === "humanity"
    ? `/${HUMANITY_PLUGIN_NAME}:${name}`
    : root.source === "project" && root.readBy.some((reader) => reader.provider === "claude-code")
      ? `/${name}`
      : `Use the ${name} skill.`

export const readsItself = (
  root: SkillRoot,
  provider: AgentProvider,
  onDefaultLogin: boolean,
): boolean =>
  root.readBy.some(
    (reader) => reader.provider === provider && (onDefaultLogin || !reader.defaultLogin),
  )

export const nativeProviders = (root: SkillRoot): ReadonlyArray<AgentProvider> => [
  ...new Set(root.readBy.map((reader) => reader.provider)),
]

export interface FoundSkill {
  readonly name: string
  readonly description: string
  readonly dir: string
  readonly root: SkillRoot
}

export interface ServedSkill {
  readonly name: string
  readonly description: string
  readonly dir: string
  readonly location: string
}

export const servedSkills = (
  found: ReadonlyArray<FoundSkill>,
  provider: AgentProvider,
  onDefaultLogin: boolean,
): ReadonlyArray<ServedSkill> => {
  const own = new Set(
    found.filter((skill) => readsItself(skill.root, provider, onDefaultLogin)).map((s) => s.name),
  )
  const served: Array<ServedSkill> = []
  const seen = new Set<string>()
  for (const skill of found) {
    if (own.has(skill.name) || seen.has(skill.name)) continue
    seen.add(skill.name)
    served.push({
      name: skill.name,
      description: skill.description,
      dir: skill.dir,
      location: skill.root.location,
    })
  }
  return served
}

const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export const skillName = (folder: string, declared: string | undefined): string | undefined =>
  declared !== undefined && SKILL_NAME.test(declared)
    ? declared
    : SKILL_NAME.test(folder)
      ? folder
      : undefined

export const MAX_DESCRIPTION = 1_024

export const oneLine = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}
