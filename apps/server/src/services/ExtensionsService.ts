import {
  type AgentProvider,
  ExtensionInvalid,
  ExtensionNotFound,
  type Extensions,
  HUMANITY_PLUGIN_NAME,
  type McpServer,
  type McpTransportInput,
  type Skill,
  type SkillInput,
} from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer, Ref, Semaphore } from "effect"
import { join } from "node:path"
import type { AgentExtensions } from "../agent/AgentRunner.ts"
import {
  type McpConfig,
  mcpConfigFromInput,
  mcpServerView,
  parseMcpImport,
  readMcpServers,
  toAgentMcpServer,
  writeMcpConfig,
} from "../extensions/mcpConfig.ts"
import {
  claudeDir,
  CliHomes,
  enabledClaudePlugins,
  type FoundSkill,
  humanitySkillRoot,
  MAX_DESCRIPTION,
  nativeProviders,
  oneLine,
  projectSkillRoots,
  type ServedSkill,
  servedSkills,
  skillInvocation,
  type SkillRoot,
  skillName,
  userSkillRoots,
} from "../extensions/skillCatalog.ts"
import { parseSkillFile, renderSkillFile } from "../extensions/skillFile.ts"
import { isInsideDir } from "../paths.ts"
import { ServerConfig } from "../ServerConfig.ts"

export interface AgentExtensionsSnapshot extends AgentExtensions {
  readonly version: number
}

interface McpFile {
  readonly servers: ReadonlyArray<readonly [string, McpConfig]>
  readonly disabled: ReadonlySet<string>
}

const SKILL_FILE = "SKILL.md"

export class ExtensionsService extends Context.Service<
  ExtensionsService,
  {
    readonly list: (projectPath: string | undefined) => Effect.Effect<Extensions>
    readonly saveMcpServer: (
      previousName: string | null,
      name: string,
      transport: McpTransportInput,
    ) => Effect.Effect<McpServer, ExtensionInvalid | ExtensionNotFound>
    readonly importMcpServers: (
      json: string,
    ) => Effect.Effect<ReadonlyArray<McpServer>, ExtensionInvalid>
    readonly setMcpServerEnabled: (
      name: string,
      enabled: boolean,
    ) => Effect.Effect<McpServer, ExtensionNotFound>
    readonly removeMcpServer: (name: string) => Effect.Effect<void, ExtensionNotFound>
    readonly saveSkill: (
      previousName: string | null,
      skill: SkillInput,
    ) => Effect.Effect<Skill, ExtensionInvalid | ExtensionNotFound>
    readonly removeSkill: (name: string) => Effect.Effect<void, ExtensionNotFound>
    readonly forAgent: Effect.Effect<AgentExtensionsSnapshot>
    readonly skillsForThread: (thread: {
      readonly provider: AgentProvider
      readonly onDefaultLogin: boolean
      readonly cwd: string
    }) => Effect.Effect<ReadonlyArray<ServedSkill>>
  }
>()("humanity/ExtensionsService") {
  static readonly layer = Layer.effect(
    ExtensionsService,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const config = yield* ServerConfig
      const skillsDir = join(config.pluginDir, "skills")
      const writeLock = yield* Semaphore.make(1)
      const version = yield* Ref.make(0)

      yield* fs.makeDirectory(join(config.pluginDir, ".claude-plugin"), { recursive: true })
      yield* fs.makeDirectory(skillsDir, { recursive: true })
      yield* fs.writeFileString(
        join(config.pluginDir, ".claude-plugin", "plugin.json"),
        `${JSON.stringify(
          {
            name: HUMANITY_PLUGIN_NAME,
            version: "1.0.0",
            description: "Skills added in Humanity's settings.",
          },
          null,
          2,
        )}\n`,
      )

      const readJson = (path: string) =>
        fs.readFileString(path).pipe(
          Effect.map((text): unknown => JSON.parse(text.replace(/^\uFEFF/, ""))),
          Effect.catch(() => Effect.succeed(undefined)),
          Effect.catchDefect(() => Effect.succeed(undefined)),
        )

      const readMcpFile = Effect.gen(function* () {
        const document = yield* readJson(config.mcpConfigPath)
        const disabled =
          typeof document === "object" &&
          document !== null &&
          "disabled" in document &&
          Array.isArray(document.disabled)
            ? document.disabled.filter((name): name is string => typeof name === "string")
            : []
        return { servers: readMcpServers(document), disabled: new Set(disabled) } satisfies McpFile
      })

      const writeMcpFile = (file: McpFile) =>
        fs
          .writeFileString(
            config.mcpConfigPath,
            `${JSON.stringify(
              {
                mcpServers: Object.fromEntries(
                  file.servers.map(([name, server]) => [name, writeMcpConfig(server)]),
                ),
                disabled: [...file.disabled].filter((name) =>
                  file.servers.some(([server]) => server === name),
                ),
              },
              null,
              2,
            )}\n`,
            { mode: 0o600 },
          )
          .pipe(Effect.orDie, Effect.andThen(Ref.update(version, (n) => n + 1)))

      const humanityServers = Effect.map(readMcpFile, (file) =>
        file.servers.map(([name, server]) =>
          mcpServerView(name, server, "humanity", !file.disabled.has(name)),
        ),
      )

      const projectServers = (projectPath: string) =>
        Effect.map(readJson(join(projectPath, ".mcp.json")), (document) =>
          readMcpServers(document).map(([name, server]) =>
            mcpServerView(name, server, "project", true),
          ),
        )

      const homes = yield* CliHomes
      const humanityRoot = humanitySkillRoot(config.pluginDir)

      const readRoot = (root: SkillRoot) =>
        Effect.gen(function* () {
          const folders = yield* fs
            .readDirectory(root.dir)
            .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])))
          const skills = yield* Effect.forEach(
            folders.filter((folder) => !folder.startsWith(".")).sort(),
            (folder) =>
              fs.readFileString(join(root.dir, folder, SKILL_FILE)).pipe(
                Effect.map((text): Array<FoundSkill & { readonly body: string }> => {
                  const file = parseSkillFile(text)
                  const name = root.source === "humanity" ? folder : skillName(folder, file.name)
                  if (name === undefined) return []
                  return [
                    {
                      name,
                      description: oneLine(file.description ?? "", MAX_DESCRIPTION),
                      dir: join(root.dir, folder),
                      root,
                      body: file.body,
                    },
                  ]
                }),
                Effect.catch(() => Effect.succeed([])),
              ),
          )
          return skills.flat()
        })

      const claudePlugins = Effect.gen(function* () {
        const dir = claudeDir(homes)
        const [settings, installed] = yield* Effect.all([
          readJson(join(dir, "settings.json")),
          readJson(join(dir, "plugins", "installed_plugins.json")),
        ])
        return enabledClaudePlugins(settings, installed)
      })

      const roots = (projectPath: string | undefined) =>
        Effect.map(claudePlugins, (plugins): ReadonlyArray<SkillRoot> => [
          humanityRoot,
          ...(projectPath === undefined ? [] : projectSkillRoots(projectPath)),
          ...userSkillRoots(homes, plugins),
        ])

      const findSkills = (projectPath: string | undefined) =>
        Effect.flatMap(roots(projectPath), (all) =>
          Effect.map(Effect.forEach(all, readRoot, { concurrency: "unbounded" }), (found) =>
            found.flat(),
          ),
        )

      const skillView = (skill: FoundSkill & { readonly body: string }): Skill => {
        const own = skill.root.source === "humanity"
        return {
          name: skill.name,
          description: skill.description,
          source: skill.root.source,
          invocation: skillInvocation(skill.name, skill.root),
          instructions: own ? skill.body : null,
          location: skill.root.location,
          nativeTo: nativeProviders(skill.root),
        }
      }

      const list = (projectPath: string | undefined) =>
        Effect.gen(function* () {
          const [ownServers, repoServers, skills] = yield* Effect.all(
            [
              humanityServers,
              projectPath === undefined ? Effect.succeed([]) : projectServers(projectPath),
              findSkills(projectPath),
            ],
            { concurrency: "unbounded" },
          )
          return {
            mcpServers: [...ownServers, ...repoServers],
            skills: skills.map(skillView),
          } satisfies Extensions
        }).pipe(Effect.withSpan("ExtensionsService.list"))

      const skillsForThread = (thread: {
        readonly provider: AgentProvider
        readonly onDefaultLogin: boolean
        readonly cwd: string
      }) =>
        Effect.map(findSkills(thread.cwd), (found) =>
          servedSkills(found, thread.provider, thread.onDefaultLogin),
        ).pipe(Effect.withSpan("ExtensionsService.skillsForThread"))

      const findServer = (file: McpFile, name: string) =>
        file.servers.find(([server]) => server === name)?.[1]

      const saveMcpServer = (
        previousName: string | null,
        name: string,
        transport: McpTransportInput,
      ) =>
        writeLock
          .withPermits(1)(
            Effect.gen(function* () {
              const file = yield* readMcpFile
              const previous = previousName === null ? undefined : findServer(file, previousName)
              if (previousName !== null && previous === undefined) {
                return yield* new ExtensionNotFound({ kind: "mcp", name: previousName })
              }
              if (name !== previousName && findServer(file, name) !== undefined) {
                return yield* new ExtensionInvalid({
                  reason: `An MCP server named "${name}" already exists. Pick another name.`,
                })
              }
              const built = mcpConfigFromInput(transport, previous)
              if ("error" in built) return yield* new ExtensionInvalid({ reason: built.error })
              const disabled = new Set(file.disabled)
              const wasDisabled = previousName !== null && disabled.delete(previousName)
              if (wasDisabled) disabled.add(name)
              const servers =
                previousName === null
                  ? [...file.servers, [name, built.config] as const]
                  : file.servers.map((entry) =>
                      entry[0] === previousName ? ([name, built.config] as const) : entry,
                    )
              yield* writeMcpFile({ servers, disabled })
              return mcpServerView(name, built.config, "humanity", !wasDisabled)
            }),
          )
          .pipe(Effect.withSpan("ExtensionsService.saveMcpServer"))

      const importMcpServers = (json: string) =>
        writeLock
          .withPermits(1)(
            Effect.gen(function* () {
              const parsed = parseMcpImport(json)
              if ("error" in parsed) return yield* new ExtensionInvalid({ reason: parsed.error })
              const file = yield* readMcpFile
              const taken = parsed.servers
                .map(([name]) => name)
                .filter((name) => findServer(file, name) !== undefined)
              if (taken.length > 0) {
                return yield* new ExtensionInvalid({
                  reason: `Already added: ${taken.join(", ")}. Remove or rename ${taken.length === 1 ? "it" : "them"} first.`,
                })
              }
              yield* writeMcpFile({
                servers: [...file.servers, ...parsed.servers],
                disabled: file.disabled,
              })
              return parsed.servers.map(([name, server]) =>
                mcpServerView(name, server, "humanity", true),
              )
            }),
          )
          .pipe(Effect.withSpan("ExtensionsService.importMcpServers"))

      const setMcpServerEnabled = (name: string, enabled: boolean) =>
        writeLock.withPermits(1)(
          Effect.gen(function* () {
            const file = yield* readMcpFile
            const server = findServer(file, name)
            if (server === undefined) return yield* new ExtensionNotFound({ kind: "mcp", name })
            const disabled = new Set(file.disabled)
            if (enabled) disabled.delete(name)
            else disabled.add(name)
            yield* writeMcpFile({ servers: file.servers, disabled })
            return mcpServerView(name, server, "humanity", enabled)
          }),
        )

      const removeMcpServer = (name: string) =>
        writeLock.withPermits(1)(
          Effect.gen(function* () {
            const file = yield* readMcpFile
            if (findServer(file, name) === undefined) {
              return yield* new ExtensionNotFound({ kind: "mcp", name })
            }
            yield* writeMcpFile({
              servers: file.servers.filter(([server]) => server !== name),
              disabled: file.disabled,
            })
          }),
        )

      const skillDir = (name: string) =>
        Effect.gen(function* () {
          const dir = join(skillsDir, name)
          if (!isInsideDir(skillsDir, dir)) {
            return yield* Effect.die(`refusing a skill folder outside ${skillsDir}: ${dir}`)
          }
          return dir
        })

      const skillExists = (name: string) =>
        Effect.flatMap(skillDir(name), (dir) =>
          fs.exists(join(dir, SKILL_FILE)).pipe(Effect.orElseSucceed(() => false)),
        )

      const saveSkill = (previousName: string | null, skill: SkillInput) =>
        writeLock
          .withPermits(1)(
            Effect.gen(function* () {
              if (previousName !== null && !(yield* skillExists(previousName))) {
                return yield* new ExtensionNotFound({ kind: "skill", name: previousName })
              }
              if (skill.name !== previousName && (yield* skillExists(skill.name))) {
                return yield* new ExtensionInvalid({
                  reason: `A skill named "${skill.name}" already exists. Pick another name.`,
                })
              }
              const description = skill.description.trim()
              if (description === "") {
                return yield* new ExtensionInvalid({
                  reason:
                    "Describe what the skill does and when to use it; the agent picks skills by it.",
                })
              }
              const dir = yield* skillDir(skill.name)
              if (previousName !== null && previousName !== skill.name) {
                yield* fs.rename(yield* skillDir(previousName), dir).pipe(Effect.orDie)
              }
              yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orDie)
              const instructions = skill.instructions.trim()
              yield* fs
                .writeFileString(
                  join(dir, SKILL_FILE),
                  renderSkillFile({ name: skill.name, description, instructions }),
                )
                .pipe(Effect.orDie)
              yield* Ref.update(version, (n) => n + 1)
              return {
                name: skill.name,
                description,
                source: "humanity",
                invocation: `/${HUMANITY_PLUGIN_NAME}:${skill.name}`,
                instructions: instructions === "" ? "" : `${instructions}\n`,
                location: humanityRoot.location,
                nativeTo: nativeProviders(humanityRoot),
              } satisfies Skill
            }),
          )
          .pipe(Effect.withSpan("ExtensionsService.saveSkill"))

      const removeSkill = (name: string) =>
        writeLock.withPermits(1)(
          Effect.gen(function* () {
            if (!(yield* skillExists(name))) {
              return yield* new ExtensionNotFound({ kind: "skill", name })
            }
            const dir = yield* skillDir(name)
            yield* fs.remove(dir, { recursive: true }).pipe(Effect.orDie)
            yield* Ref.update(version, (n) => n + 1)
          }),
        )

      const forAgent = Effect.gen(function* () {
        const current = yield* Ref.get(version)
        const file = yield* readMcpFile
        return {
          version: current,
          mcpServers: Object.fromEntries(
            file.servers
              .filter(([name]) => !file.disabled.has(name))
              .map(([name, server]) => [name, toAgentMcpServer(server, process.env)]),
          ),
          plugins: [config.pluginDir],
        } satisfies AgentExtensionsSnapshot
      })

      return ExtensionsService.of({
        list,
        saveMcpServer,
        importMcpServers,
        setMcpServerEnabled,
        removeMcpServer,
        saveSkill,
        removeSkill,
        forAgent,
        skillsForThread,
      })
    }).pipe(Effect.orDie),
  )
}
