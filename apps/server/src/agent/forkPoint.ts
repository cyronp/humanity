import type { AgentProvider } from "@humanity/contracts"
import type { RawMessage } from "../db/SessionRepo.ts"

export type ForkPoint =
  { readonly _tag: "Native"; readonly at: string } | { readonly _tag: "Handoff" }

export const FORK_SEARCH_LIMIT = 500

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export const claudeAnchor = (raw: unknown): string | undefined => {
  if (!isRecord(raw)) return undefined
  if (raw["type"] !== "assistant" && raw["type"] !== "user") return undefined
  if (raw["parent_tool_use_id"] !== null && raw["parent_tool_use_id"] !== undefined) {
    return undefined
  }
  const uuid = raw["uuid"]
  return typeof uuid === "string" && uuid !== "" ? uuid : undefined
}

export const codexAnchor = (raw: unknown): string | undefined => {
  if (!isRecord(raw) || raw["type"] !== "codex" || raw["method"] !== "turn/completed") {
    return undefined
  }
  const params = raw["params"]
  const turn = isRecord(params) ? params["turn"] : undefined
  const id = isRecord(turn) ? turn["id"] : undefined
  return typeof id === "string" && id !== "" ? id : undefined
}

const anchorOf = (provider: AgentProvider, raw: unknown): string | undefined => {
  switch (provider) {
    case "claude-code":
      return claudeAnchor(raw)
    case "codex":
      return codexAnchor(raw)
    case "kiro":
    case "antigravity":
      return undefined
  }
}

export const forkPoint = (options: {
  readonly provider: AgentProvider
  readonly sdkSessionId: string | null
  readonly newestFirst: ReadonlyArray<RawMessage>
  readonly switchedSince: boolean
}): ForkPoint => {
  if (options.sdkSessionId === null || options.switchedSince) return { _tag: "Handoff" }
  for (const message of options.newestFirst) {
    if (message.role === "provider_switch") return { _tag: "Handoff" }
    const at = anchorOf(options.provider, message.raw)
    if (at !== undefined) return { _tag: "Native", at }
  }
  return { _tag: "Handoff" }
}
