import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ExtensionsService } from "../src/services/ExtensionsService.ts"
import { baseLayer, tempDir } from "./helpers.ts"

const services = (home: string) => ExtensionsService.layer.pipe(Layer.provideMerge(baseLayer(home)))

const stdio = (env: ReadonlyArray<{ name: string; value: string | null }> = []) =>
  ({ _tag: "stdio", command: "npx", args: ["-y", "server"], env }) as const

describe("ExtensionsService", () => {
  it.live("keeps MCP servers in Humanity's data folder, tokens out of the UI", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      yield* Effect.gen(function* () {
        const extensions = yield* ExtensionsService
        const saved = yield* extensions.saveMcpServer(
          null,
          "tracker",
          stdio([{ name: "API_TOKEN", value: "s3cret" }]),
        )
        assert.deepStrictEqual(saved, {
          name: "tracker",
          source: "humanity",
          enabled: true,
          transport: { _tag: "stdio", command: "npx", args: ["-y", "server"], env: ["API_TOKEN"] },
        })
        const listed = yield* extensions.list(undefined)
        assert.deepStrictEqual(listed.mcpServers, [saved])
        assert.isFalse(JSON.stringify(listed).includes("s3cret"))

        const agent = yield* extensions.forAgent
        assert.deepStrictEqual(agent.mcpServers, {
          tracker: {
            type: "stdio",
            command: "npx",
            args: ["-y", "server"],
            env: { API_TOKEN: "s3cret" },
          },
        })
        assert.deepStrictEqual(agent.plugins, [join(home, "plugin")])
      }).pipe(Effect.provide(services(home)))

      const file = JSON.parse(readFileSync(join(home, "mcp.json"), "utf8"))
      assert.strictEqual(file.mcpServers.tracker.env.API_TOKEN, "s3cret")
      if (process.platform !== "win32") {
        assert.strictEqual(statSync(join(home, "mcp.json")).mode & 0o777, 0o600)
      }
    }),
  )

  it.live("edits, renames, disables and removes a server, keeping unchanged secrets", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      yield* Effect.gen(function* () {
        const extensions = yield* ExtensionsService
        yield* extensions.saveMcpServer(null, "a", stdio([{ name: "TOKEN", value: "keep-me" }]))
        yield* extensions.saveMcpServer(null, "b", {
          _tag: "http",
          url: "https://b.dev/mcp",
          headers: [],
        })

        const taken = yield* extensions.saveMcpServer("a", "b", stdio()).pipe(Effect.flip)
        assert.strictEqual(taken._tag, "ExtensionInvalid")

        yield* extensions.setMcpServerEnabled("a", false)
        const renamed = yield* extensions.saveMcpServer(
          "a",
          "renamed",
          stdio([{ name: "TOKEN", value: null }]),
        )
        assert.isFalse(renamed.enabled)
        assert.deepStrictEqual(
          (yield* extensions.list(undefined)).mcpServers.map((server) => server.name),
          ["renamed", "b"],
        )
        assert.deepStrictEqual(Object.keys((yield* extensions.forAgent).mcpServers), ["b"])

        yield* extensions.setMcpServerEnabled("renamed", true)
        const agent = yield* extensions.forAgent
        assert.deepStrictEqual(agent.mcpServers["renamed"], {
          type: "stdio",
          command: "npx",
          args: ["-y", "server"],
          env: { TOKEN: "keep-me" },
        })

        yield* extensions.removeMcpServer("b")
        const gone = yield* extensions.removeMcpServer("b").pipe(Effect.flip)
        assert.strictEqual(gone._tag, "ExtensionNotFound")
        const missing = yield* extensions.setMcpServerEnabled("nope", true).pipe(Effect.flip)
        assert.strictEqual(missing._tag, "ExtensionNotFound")
      }).pipe(Effect.provide(services(home)))
    }),
  )

  it.live("imports pasted servers, refusing names already taken", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      yield* Effect.gen(function* () {
        const extensions = yield* ExtensionsService
        const imported = yield* extensions.importMcpServers(
          JSON.stringify({
            mcpServers: {
              one: { command: "one" },
              two: { type: "sse", url: "https://two.dev/sse", headers: { Key: "k" } },
            },
          }),
        )
        assert.deepStrictEqual(
          imported.map((server) => server.name),
          ["one", "two"],
        )
        const again = yield* extensions
          .importMcpServers('{ "two": { "command": "x" } }')
          .pipe(Effect.flip)
        assert.strictEqual(again._tag, "ExtensionInvalid")
        assert.include(again.message, "two")
        assert.lengthOf((yield* extensions.list(undefined)).mcpServers, 2)
      }).pipe(Effect.provide(services(home)))
    }),
  )

  it.live("writes skills into Humanity's plugin and reads a repository's own", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempDir("humanity-repo-")
      mkdirSync(join(repo, ".claude", "skills", "deploy"), { recursive: true })
      writeFileSync(
        join(repo, ".claude", "skills", "deploy", "SKILL.md"),
        "---\nname: deploy\ndescription: Ships the app\n---\nSteps.\n",
      )
      mkdirSync(join(repo, ".claude", "skills", "empty"), { recursive: true })
      writeFileSync(
        join(repo, ".mcp.json"),
        JSON.stringify({ mcpServers: { docs: { type: "http", url: "https://docs.dev/mcp" } } }),
      )

      yield* Effect.gen(function* () {
        const extensions = yield* ExtensionsService
        const before = (yield* extensions.forAgent).version
        const skill = yield* extensions.saveSkill(null, {
          name: "review-sql",
          description: "Reviews SQL queries",
          instructions: "Check every join.",
        })
        assert.deepStrictEqual(skill, {
          name: "review-sql",
          description: "Reviews SQL queries",
          source: "humanity",
          invocation: "/humanity:review-sql",
          instructions: "Check every join.\n",
          location: "Humanity",
          nativeTo: ["claude-code"],
        })
        assert.isAbove((yield* extensions.forAgent).version, before)

        const listed = yield* extensions.list(repo)
        assert.deepStrictEqual(listed.skills, [
          skill,
          {
            name: "deploy",
            description: "Ships the app",
            source: "project",
            invocation: "/deploy",
            instructions: null,
            location: ".claude/skills",
            nativeTo: ["claude-code"],
          },
        ])
        assert.deepStrictEqual(listed.mcpServers, [
          {
            name: "docs",
            source: "project",
            enabled: true,
            transport: { _tag: "http", url: "https://docs.dev/mcp", headers: [] },
          },
        ])

        const blank = yield* extensions
          .saveSkill(null, { name: "other", description: "   ", instructions: "" })
          .pipe(Effect.flip)
        assert.strictEqual(blank._tag, "ExtensionInvalid")

        yield* extensions.saveSkill("review-sql", {
          name: "sql-review",
          description: "Reviews SQL",
          instructions: "Check joins.",
        })
        assert.deepStrictEqual(
          (yield* extensions.list(undefined)).skills.map((s) => s.invocation),
          ["/humanity:sql-review"],
        )
        yield* extensions.removeSkill("sql-review")
        assert.lengthOf((yield* extensions.list(undefined)).skills, 0)
        const gone = yield* extensions.removeSkill("sql-review").pipe(Effect.flip)
        assert.strictEqual(gone._tag, "ExtensionNotFound")
      }).pipe(Effect.provide(services(home)))

      const manifest = JSON.parse(
        readFileSync(join(home, "plugin", ".claude-plugin", "plugin.json"), "utf8"),
      )
      assert.strictEqual(manifest.name, "humanity")
    }),
  )

  it.live(
    "finds the human's skills in every agent's folders and serves each thread the others",
    () =>
      Effect.gen(function* () {
        const home = yield* tempDir()
        const repo = yield* tempDir("humanity-repo-")
        const user = join(home, "user-home")
        const skill = (dir: string, folder: string, frontmatter: ReadonlyArray<string>) => {
          mkdirSync(join(dir, folder), { recursive: true })
          writeFileSync(
            join(dir, folder, "SKILL.md"),
            ["---", ...frontmatter, "---", "Do it.", ""].join("\n"),
          )
        }
        const claudeSkills = join(user, ".claude", "skills")
        const codexSkills = join(user, ".codex", "skills")
        const pluginDir = join(user, ".claude", "plugins", "cache", "official", "design", "1.0.0")
        skill(claudeSkills, "frontend", ["name: frontend", "description: Builds UIs"])
        skill(claudeSkills, "shared", ["name: shared", "description: Claude copy"])
        skill(codexSkills, "architecture", ["description: |", "  Improves", "  architecture"])
        skill(codexSkills, ".system", ["name: system", "description: Built in"])
        skill(codexSkills, "shared", ["name: shared", "description: Codex copy"])
        skill(join(user, ".agents", "skills"), "foundry", ["name: foundry", "description: Azure"])
        skill(join(user, ".gemini", "config", "skills"), "slides", [
          "name: slides",
          "description: Decks",
        ])
        skill(join(user, ".kiro", "skills"), "specs", ["name: specs", "description: Writes specs"])
        skill(join(pluginDir, "skills"), "design", ["name: design", "description: From a plugin"])
        writeFileSync(
          join(user, ".claude", "settings.json"),
          JSON.stringify({ enabledPlugins: { "design@official": true, "off@official": false } }),
        )
        writeFileSync(
          join(user, ".claude", "plugins", "installed_plugins.json"),
          JSON.stringify({
            version: 2,
            plugins: {
              "design@official": [
                {
                  scope: "user",
                  installPath: pluginDir,
                },
              ],
            },
          }),
        )
        skill(join(repo, ".agents", "skills"), "release", ["name: release", "description: Ships"])

        yield* Effect.gen(function* () {
          const extensions = yield* ExtensionsService
          yield* extensions.saveSkill(null, {
            name: "review-sql",
            description: "Reviews SQL",
            instructions: "Check joins.",
          })

          const listed = (yield* extensions.list(repo)).skills
          assert.deepStrictEqual(
            listed.map((each) => [each.name, each.source, each.location, each.nativeTo]),
            [
              ["review-sql", "humanity", "Humanity", ["claude-code"]],
              ["release", "project", ".agents/skills", ["codex", "antigravity"]],
              ["frontend", "user", "~/.claude/skills", ["claude-code"]],
              ["shared", "user", "~/.claude/skills", ["claude-code"]],
              ["design", "user", "Claude Code plugin design", ["claude-code"]],
              ["foundry", "user", "~/.agents/skills", ["codex"]],
              ["architecture", "user", "~/.codex/skills", ["codex"]],
              ["shared", "user", "~/.codex/skills", ["codex"]],
              ["slides", "user", "~/.gemini/config/skills", ["antigravity"]],
              ["specs", "user", "~/.kiro/skills", ["kiro"]],
            ],
          )
          assert.strictEqual(
            listed.find((each) => each.name === "architecture")?.description,
            "Improves architecture",
          )
          assert.deepStrictEqual(
            ["review-sql", "release", "frontend"].map(
              (name) => listed.find((each) => each.name === name)?.invocation,
            ),
            ["/humanity:review-sql", "Use the release skill.", "Use the frontend skill."],
          )

          const served = (
            provider: "claude-code" | "codex" | "kiro" | "antigravity",
            onDefaultLogin = true,
          ) =>
            Effect.map(
              extensions.skillsForThread({ provider, onDefaultLogin, cwd: repo }),
              (skills) => skills.map((each) => each.name),
            )
          assert.deepStrictEqual(yield* served("claude-code"), [
            "release",
            "foundry",
            "architecture",
            "slides",
            "specs",
          ])
          assert.deepStrictEqual(yield* served("codex"), [
            "review-sql",
            "frontend",
            "design",
            "slides",
            "specs",
          ])
          assert.deepStrictEqual(yield* served("codex", false), [
            "review-sql",
            "frontend",
            "shared",
            "design",
            "architecture",
            "slides",
            "specs",
          ])
          const forClaudeAccount = yield* extensions.skillsForThread({
            provider: "claude-code",
            onDefaultLogin: false,
            cwd: repo,
          })
          assert.deepStrictEqual(
            forClaudeAccount.map((each) => [each.name, each.location]),
            [
              ["release", ".agents/skills"],
              ["frontend", "~/.claude/skills"],
              ["shared", "~/.claude/skills"],
              ["design", "Claude Code plugin design"],
              ["foundry", "~/.agents/skills"],
              ["architecture", "~/.codex/skills"],
              ["slides", "~/.gemini/config/skills"],
              ["specs", "~/.kiro/skills"],
            ],
          )
          assert.notInclude(yield* served("antigravity"), "slides")
          assert.notInclude(yield* served("antigravity"), "release")
          assert.notInclude(yield* served("kiro"), "specs")
        }).pipe(Effect.provide(services(home)))
      }),
  )
})
