import { SKILL_TOOL_NAME } from "@humanity/contracts"
import { Effect, type FileSystem } from "effect"
import { join, sep } from "node:path"
import { isInsideDir } from "../paths.ts"
import type { ToolText } from "../terminal/agentTools.ts"
import { parseSkillFile } from "./skillFile.ts"
import { oneLine, type ServedSkill } from "./skillCatalog.ts"

const DESCRIPTION_IN_LIST = 300
const MAX_FILE_BYTES = 256 * 1024
const MAX_LISTED_FILES = 60
const SKIPPED_FOLDERS = new Set(["node_modules", "__pycache__"])

export const skillToolDefinition = (skills: ReadonlyArray<ServedSkill>) => ({
  name: SKILL_TOOL_NAME,
  title: "Load a skill",
  description: `Loads a skill: instructions for a kind of task, kept in the human's other coding agents or in this repository. These are skills you do not have otherwise. When a task matches a skill's description, load it before you start and follow it. A message from the human that names a skill ("Use the <name> skill", /<name>, /<plugin>:<name>) asks for it.
Call it with \`name\` to read the skill's SKILL.md; the result names the skill's folder and its other files. Read one of those with \`name\` and \`file\`, a path relative to the skill's folder. Run a skill's scripts with your shell, from that folder.

Skills:
${skills.map((skill) => `- ${skill.name}: ${oneLine(skill.description, DESCRIPTION_IN_LIST) || "(no description)"}`).join("\n")}`,
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        enum: skills.map((skill) => skill.name),
        description: "The skill, by its name in the list.",
      },
      file: {
        type: "string",
        description:
          "One of the skill's other files, relative to its folder (`references/api.md`). Leave out for its SKILL.md.",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  _meta: { "anthropic/alwaysLoad": true },
})

const said = (text: string, isError = false): ToolText => ({ text, isError })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The files of a skill's folder, relative to it, without hidden or dependency folders. */
const listFiles = (fs: FileSystem.FileSystem, dir: string) =>
  fs.readDirectory(dir, { recursive: true }).pipe(
    Effect.map((entries) =>
      entries
        .map((entry) => entry.split(sep).join("/"))
        .filter(
          (entry) =>
            entry !== "SKILL.md" &&
            !entry.split("/").some((part) => part.startsWith(".") || SKIPPED_FOLDERS.has(part)),
        )
        .sort(),
    ),
    Effect.flatMap((entries) =>
      Effect.filter(entries, (entry) =>
        fs.stat(join(dir, entry)).pipe(
          Effect.map((info) => info.type === "File"),
          Effect.orElseSucceed(() => false),
        ),
      ),
    ),
    Effect.orElseSucceed((): ReadonlyArray<string> => []),
  )

const readText = (fs: FileSystem.FileSystem, path: string) =>
  Effect.gen(function* () {
    const info = yield* fs.stat(path)
    if (info.type !== "File") return said(`Not a file: ${path}`, true)
    if (Number(info.size) > MAX_FILE_BYTES) {
      return said(
        `${path} is ${Math.round(Number(info.size) / 1024)} KB, more than load_skill reads (${MAX_FILE_BYTES / 1024} KB). Read it with your own tools.`,
        true,
      )
    }
    const bytes = yield* fs.readFile(path)
    if (bytes.includes(0)) {
      return said(`${path} is not a text file. Use it with your own tools.`, true)
    }
    return said(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ""))
  }).pipe(Effect.catch(() => Effect.succeed(said(`Could not read ${path}.`, true))))

/**
 * `load_skill` for one thread: reads the skills it was given at its start, from where they are,
 * and nothing outside their folders.
 */
export const makeSkillTool =
  (fs: FileSystem.FileSystem, skills: ReadonlyArray<ServedSkill>) =>
  (args: unknown): Effect.Effect<ToolText> =>
    Effect.gen(function* () {
      const name = isRecord(args) ? args["name"] : undefined
      const file = isRecord(args) ? args["file"] : undefined
      const skill = skills.find((each) => each.name === name)
      if (skill === undefined) {
        return said(
          `No skill named ${JSON.stringify(name)}. The skills are: ${skills.map((each) => each.name).join(", ")}.`,
          true,
        )
      }
      if (file !== undefined && file !== null && file !== "") {
        if (typeof file !== "string") return said("`file` must be a path, as a string.", true)
        const path = join(skill.dir, file)
        if (!isInsideDir(skill.dir, path)) {
          return said(`${file} is not inside the skill's folder, ${skill.dir}.`, true)
        }
        return yield* readText(fs, path)
      }
      const manifest = yield* readText(fs, join(skill.dir, "SKILL.md"))
      if (manifest.isError) return manifest
      const instructions = parseSkillFile(manifest.text).body.trim()
      const files = yield* listFiles(fs, skill.dir)
      const shown = files.slice(0, MAX_LISTED_FILES)
      const listing =
        files.length === 0
          ? "It has no other files."
          : `Its other files, relative to that folder:\n${shown.map((each) => `- ${each}`).join("\n")}${
              files.length > shown.length ? `\n- … and ${files.length - shown.length} more` : ""
            }`
      return said(
        `Skill "${skill.name}", from ${skill.location}. Its folder: ${skill.dir}\n${listing}\n\n${instructions}`,
      )
    })
