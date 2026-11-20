import { type AgentProvider, HUMANITY_PLUGIN_NAME, type SkillSource } from "@humanity/contracts"
import { Context } from "effect"
import { homedir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"
import { claudeConfigDir } from "../claude/environment.ts"

/** The human's own home and environment, where each CLI keeps its folders. */
export interface CliHomesShape {
  readonly userHome: string
  readonly env: Readonly<Record<string, string | undefined>>
}

export const CliHomes = Context.Reference<CliHomesShape>("humanity/CliHomes", {
  defaultValue: () => ({ userHome: homedir(), env: process.env }),
})

/**
 * A provider that reads a folder of skills itself. `defaultLogin`: only while the thread runs
 * on the CLI's own login, since an added account points the CLI at a folder of its own.
 */
export interface NativeReader {
  readonly provider: AgentProvider
  readonly defaultLogin: boolean
}

export interface SkillRoot {
  /** A folder holding one folder per skill, each with its `SKILL.md`. */
  readonly dir: string
  readonly source: SkillSource
  /** Shown to the human and the agent: the folder, short, or the plugin. */
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

/** The skills of Humanity's settings: a Claude Code plugin, so Claude Code reads them itself. */
export const humanitySkillRoot = (pluginDir: string): SkillRoot => ({
  dir: join(pluginDir, "skills"),
  source: "humanity",
  location: "Humanity",
  readBy: always("claude-code"),
})

/** A repository's folders of skills, in the folder a session works in. */
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
  /** `name@marketplace`, as Claude Code's settings name it. */
  readonly id: string
  readonly installPath: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * The plugins Claude Code loads for the human: enabled in their `settings.json` and installed
 * for the user (`plugins/installed_plugins.json`, an entry or, since its version 2, a list of
 * them by scope). A plugin installed for one project only is left to that project.
 */
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

/**
 * The human's own folders of skills, as each CLI finds them on its own login. Built-in skills
 * (`.system`, `builtin`, Claude's `synced` ones from claude.ai) are each CLI's own and left out.
 */
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

/**
 * What the composer puts in a message to ask for a skill. Humanity's and a repository's
 * `.claude/skills` are Claude Code's slash commands; any other skill is asked for in words,
 * since a slash command one agent does not know may be refused, and every agent reads a sentence.
 */
export const skillInvocation = (name: string, root: SkillRoot): string =>
  root.source === "humanity"
    ? `/${HUMANITY_PLUGIN_NAME}:${name}`
    : root.source === "project" && root.readBy.some((reader) => reader.provider === "claude-code")
      ? `/${name}`
      : `Use the ${name} skill.`

/** Whether a thread on `provider` (on its CLI's own login, or an added account) reads the folder itself. */
export const readsItself = (
  root: SkillRoot,
  provider: AgentProvider,
  onDefaultLogin: boolean,
): boolean =>
  root.readBy.some(
    (reader) => reader.provider === provider && (onDefaultLogin || !reader.defaultLogin),
  )

/** The providers that read a folder themselves, on their CLI's own login. */
export const nativeProviders = (root: SkillRoot): ReadonlyArray<AgentProvider> => [
  ...new Set(root.readBy.map((reader) => reader.provider)),
]

export interface FoundSkill {
  readonly name: string
  readonly description: string
  /** The skill's own folder, where its `SKILL.md` is. */
  readonly dir: string
  readonly root: SkillRoot
}

/** What `load_skill` offers a thread. */
export interface ServedSkill {
  readonly name: string
  readonly description: string
  readonly dir: string
  readonly location: string
}

/**
 * The skills a thread's agent gets from Humanity: those its CLI does not read itself, once per
 * name, the first found winning (Humanity's, then the repository's, then the human's own), and
 * never one named like a skill its CLI already has.
 */
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

/** A skill's name: its `SKILL.md`'s own when it is a plain one, else its folder's. */
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
