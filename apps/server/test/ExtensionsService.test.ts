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

        // The agent gets the value.
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

      // In Claude Code's format, and only readable by the human where the OS supports it.
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
        // Still disabled after the rename, and still in first place.
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
      // A folder without a SKILL.md is no skill.
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

      // The plugin manifest Claude Code loads the folder by.
      const manifest = JSON.parse(
        readFileSync(join(home, "plugin", ".claude-plugin", "plugin.json"), "utf8"),
      )
      assert.strictEqual(manifest.name, "humanity")
    }),
  )
})
