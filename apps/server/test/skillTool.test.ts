import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { SKILL_TOOL } from "@humanity/contracts"
import { Effect, FileSystem } from "effect"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { enabledClaudePlugins, type ServedSkill } from "../src/extensions/skillCatalog.ts"
import { makeSkillTool, skillToolDefinition } from "../src/extensions/skillTool.ts"
import { answerMcp } from "../src/mcp/HumanityMcp.ts"
import { loadedSkill } from "../src/services/SessionService.ts"
import { tempDir } from "./helpers.ts"

const frontendSkill = (root: string): ServedSkill => {
  const dir = join(root, "frontend")
  mkdirSync(join(dir, "references"), { recursive: true })
  mkdirSync(join(dir, ".git"), { recursive: true })
  writeFileSync(
    join(dir, "SKILL.md"),
    ["---", "name: frontend", "description: Builds UIs", "---", "", "Use the design tokens."].join(
      "\n",
    ),
  )
  writeFileSync(join(dir, "references", "tokens.md"), "# Tokens")
  writeFileSync(join(dir, ".git", "HEAD"), "ref")
  writeFileSync(join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x47]))
  writeFileSync(join(root, "secret.txt"), "not the skill's")
  return { name: "frontend", description: "Builds UIs", dir, location: "~/.claude/skills" }
}

const load = (skill: ServedSkill, args: unknown) =>
  Effect.flatMap(Effect.service(FileSystem.FileSystem), (fs) => makeSkillTool(fs, [skill])(args))

describe("load_skill", () => {
  it.live("reads a skill's instructions with its folder and files, then one of its files", () =>
    Effect.gen(function* () {
      const skill = frontendSkill(yield* tempDir())

      const manifest = yield* load(skill, { name: "frontend" })
      assert.isFalse(manifest.isError)
      assert.include(
        manifest.text,
        `Skill "frontend", from ~/.claude/skills. Its folder: ${skill.dir}`,
      )
      assert.include(manifest.text, "- logo.png\n- references/tokens.md")
      assert.notInclude(manifest.text, ".git")
      assert.notInclude(manifest.text, "description: Builds UIs")
      assert.isTrue(manifest.text.endsWith("Use the design tokens."))

      const reference = yield* load(skill, { name: "frontend", file: "references/tokens.md" })
      assert.deepStrictEqual(reference, { text: "# Tokens", isError: false })
    }).pipe(Effect.provide(NodeServices.layer)),
  )

  it.live("refuses unknown skills, files outside the skill and binary files", () =>
    Effect.gen(function* () {
      const skill = frontendSkill(yield* tempDir())

      const unknown = yield* load(skill, { name: "backend" })
      assert.isTrue(unknown.isError)
      assert.include(unknown.text, "The skills are: frontend.")

      const outside = yield* load(skill, { name: "frontend", file: "../secret.txt" })
      assert.isTrue(outside.isError)
      assert.notInclude(outside.text, "not the skill's")

      const binary = yield* load(skill, { name: "frontend", file: "logo.png" })
      assert.isTrue(binary.isError)

      const missing = yield* load(skill, { name: "frontend", file: "nope.md" })
      assert.isTrue(missing.isError)
    }).pipe(Effect.provide(NodeServices.layer)),
  )

  it.effect("is listed by Humanity's server with its skills, only when there are some", () =>
    Effect.gen(function* () {
      const skill: ServedSkill = {
        name: "frontend",
        description: "Builds UIs\nwith care",
        dir: "/skills/frontend",
        location: "~/.claude/skills",
      }
      const definition = skillToolDefinition([skill])
      assert.include(definition.description, "- frontend: Builds UIs with care")
      assert.deepStrictEqual(definition.inputSchema.properties.name.enum, ["frontend"])
      assert.isTrue(definition.annotations.readOnlyHint)

      const names = (tools: Parameters<typeof answerMcp>[0]) =>
        Effect.map(answerMcp(tools, { jsonrpc: "2.0", id: 1, method: "tools/list" }), (reply) =>
          (reply.body as { result: { tools: ReadonlyArray<{ name: string }> } }).result.tools.map(
            (tool) => tool.name,
          ),
        )
      const loads: Array<unknown> = []
      const load = (args: unknown) =>
        Effect.sync(() => {
          loads.push(args)
          return { text: "Use the design tokens.", isError: false }
        })
      assert.deepStrictEqual(yield* names({ skills: { catalog: [skill], load } }), ["load_skill"])
      assert.deepStrictEqual(yield* names({ skills: { catalog: [], load } }), [])

      const called = yield* answerMcp(
        { skills: { catalog: [skill], load } },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "load_skill", arguments: { name: "frontend" } },
        },
      )
      assert.deepStrictEqual(called.body, {
        jsonrpc: "2.0",
        id: 2,
        result: { content: [{ type: "text", text: "Use the design tokens." }] },
      })
      assert.deepStrictEqual(loads, [{ name: "frontend" }])

      const without = yield* answerMcp(
        {},
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "load_skill", arguments: { name: "frontend" } },
        },
      )
      assert.deepInclude(without.body as object, {
        error: { code: -32602, message: "Unknown tool: load_skill" },
      })
    }),
  )

  it("shows a skill's instructions loading in the timeline, not its other files", () => {
    assert.strictEqual(loadedSkill("Skill", { skill: "review" }), "review")
    assert.strictEqual(loadedSkill(SKILL_TOOL, { name: "frontend" }), "frontend")
    assert.isUndefined(loadedSkill(SKILL_TOOL, { name: "frontend", file: "a.md" }))
    assert.isUndefined(loadedSkill("Read", { file_path: "SKILL.md" }))
  })
})

describe("Claude Code's plugins", () => {
  it("are the enabled ones installed for the user, in either format of its list", () => {
    const settings = {
      enabledPlugins: { "design@official": true, "off@official": false, "repo@official": true },
    }
    assert.deepStrictEqual(
      enabledClaudePlugins(settings, {
        version: 2,
        plugins: {
          "design@official": [{ scope: "user", installPath: "/cache/design" }],
          "off@official": [{ scope: "user", installPath: "/cache/off" }],
          "repo@official": [{ scope: "project", installPath: "/cache/repo" }],
        },
      }),
      [{ id: "design@official", installPath: "/cache/design" }],
    )
    assert.deepStrictEqual(
      enabledClaudePlugins(settings, {
        version: 1,
        plugins: { "design@official": { installPath: "/cache/design", version: "1.0.0" } },
      }),
      [{ id: "design@official", installPath: "/cache/design" }],
    )
    assert.deepStrictEqual(enabledClaudePlugins(undefined, undefined), [])
  })
})
