import {
  type ChatMessage,
  DEFAULT_BRANCH_PREFIX,
  type MessageContent,
  type Session,
  SKILL_TOOL,
  trimCharacters,
  trimTrailing,
} from "@humanity/contracts"

export const loadedSkill = (toolName: string, input: unknown): string | undefined => {
  const fields =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}
  if (toolName === "Skill") {
    return typeof fields["skill"] === "string" ? fields["skill"] : "unknown"
  }
  if (toolName !== SKILL_TOOL) return undefined
  const file = fields["file"]
  if (file !== undefined && file !== null && file !== "") return undefined
  return typeof fields["name"] === "string" ? fields["name"] : "unknown"
}

export const slugify = (title: string): string => {
  const words = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
  return trimTrailing(trimCharacters(words, "-").slice(0, 40), "-") || "session"
}

export const sessionBranchName = (
  sessionId: string,
  title: string,
  prefix: string = DEFAULT_BRANCH_PREFIX,
): string => `${prefix}${sessionId.slice(0, 8)}-${slugify(title)}`

export const withoutPromptLine = (text: string): string => {
  const lines = text.replace(/\s+$/, "").split("\n")
  return lines.length <= 1 ? text : lines.slice(0, -1).join("\n")
}
export const setupCommand = (script: string | null): string | undefined => {
  const lines = (script ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
  return lines.length === 0 ? undefined : lines.join(" && ")
}

const modelKey = (name: string): string => {
  const words = name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
  return trimCharacters(words, "-").replace(/^claude-/, "")
}

interface OfferedModel {
  readonly value: string
  readonly displayName: string
}

export const matchModel = (
  models: ReadonlyArray<OfferedModel>,
  requested: string,
): string | undefined => {
  const wanted = requested.trim().toLowerCase()
  const exact = models.find((model) => model.value.toLowerCase() === wanted)
  if (exact !== undefined) return exact.value
  const key = modelKey(requested)
  if (key === "") return undefined
  return models.find(
    (model) => modelKey(model.value) === key || modelKey(model.displayName) === key,
  )?.value
}

export const unsentSwitch = (
  messages: ReadonlyArray<ChatMessage>,
):
  | (ChatMessage & { readonly content: Extract<MessageContent, { _tag: "provider_switch" }> })
  | undefined => {
  const at = messages.findLastIndex((message) => message.content._tag === "provider_switch")
  const found = messages[at]
  if (found?.content._tag !== "provider_switch") return undefined
  if (messages.slice(at + 1).some((message) => message.content._tag === "user")) return undefined
  return { ...found, content: found.content }
}

export const threadBranch = (session: Session): string | null =>
  session.branch === "HEAD" ? null : session.branch

export const isBusy = (session: Session) =>
  session.status === "running" || session.status === "waiting_for_human"
