/**
 * SKILL.md files: YAML frontmatter with the skill's `name` and `description`,
 * then the instructions as Markdown. Only the frontmatter subset skills use
 * is read: plain, quoted and block (`|`, `>`) scalars.
 */

export interface SkillFile {
  readonly name: string | undefined
  readonly description: string | undefined
  /** The instructions after the frontmatter. */
  readonly body: string
}

const unquote = (value: string): string => {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (typeof parsed === "string") return parsed
    } catch {
      // Not JSON-compatible: fall back to the text between the quotes.
    }
    return value.slice(1, -1)
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replaceAll("''", "'")
  }
  return value
}

const isIndented = (line: string) => /^\s+\S/.test(line) || line.trim() === ""

/** Top-level `key: value` pairs of a frontmatter block. */
const parseFrontmatter = (lines: ReadonlyArray<string>): Map<string, string> => {
  const fields = new Map<string, string>()
  let index = 0
  while (index < lines.length) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[index] ?? "")
    index++
    if (match === null) continue
    const key = match[1] ?? ""
    const raw = (match[2] ?? "").trim()
    const continuation: Array<string> = []
    while (index < lines.length && isIndented(lines[index] ?? "")) {
      continuation.push(lines[index] ?? "")
      index++
    }
    const block = /^([|>])[+-]?$/.exec(raw)
    if (block !== null) {
      const content = continuation.map((line) => line.trim())
      while (content.length > 0 && content[content.length - 1] === "") content.pop()
      fields.set(key, block[1] === "|" ? content.join("\n") : content.join(" ").trim())
    } else {
      // A plain scalar may wrap onto indented lines; YAML folds them with spaces.
      const folded = [raw, ...continuation.map((line) => line.trim())]
        .filter((part) => part !== "")
        .join(" ")
      fields.set(key, unquote(folded))
    }
  }
  return fields
}

export const parseSkillFile = (text: string): SkillFile => {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  if (lines[0]?.trim() !== "---") {
    return { name: undefined, description: undefined, body: normalized }
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (end === -1) return { name: undefined, description: undefined, body: normalized }
  const fields = parseFrontmatter(lines.slice(1, end))
  const body = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\n+/, "")
  const name = fields.get("name")
  const description = fields.get("description")
  return {
    name: name === undefined || name === "" ? undefined : name,
    description: description === undefined || description === "" ? undefined : description,
    body,
  }
}

/** The SKILL.md of a skill written in Humanity. Quoting with JSON keeps any description valid YAML. */
export const renderSkillFile = (skill: {
  readonly name: string
  readonly description: string
  readonly instructions: string
}): string => {
  const body = skill.instructions.replace(/\r\n?/g, "\n").trim()
  return `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${body}\n`
}
