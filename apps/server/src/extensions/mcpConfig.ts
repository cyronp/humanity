import type { McpServer, McpTransportInput } from "@humanity/contracts"
import type { AgentMcpServer } from "../agent/AgentRunner.ts"

/**
 * MCP server configurations in Claude Code's own format (`.mcp.json`):
 * `{ "mcpServers": { "<name>": { "command": …, "args": […], "env": {…} } } }`
 * for local servers, `{ "type": "http" | "sse", "url": …, "headers": {…} }`
 * for remote ones. No I/O here.
 */

export type McpConfig =
  | {
      readonly _tag: "stdio"
      readonly command: string
      readonly args: ReadonlyArray<string>
      readonly env: Readonly<Record<string, string>>
    }
  | {
      readonly _tag: "http" | "sse"
      readonly url: string
      readonly headers: Readonly<Record<string, string>>
    }

export const MCP_SERVER_NAME = /^[A-Za-z0-9_-]{1,64}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Only string values; anything else in the map is dropped. */
const stringMap = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item
    else if (typeof item === "number" || typeof item === "boolean") out[key] = String(item)
  }
  return out
}

/** A configuration as Claude Code reads it, or `undefined` when it is not one Humanity understands. */
export const readMcpConfig = (raw: unknown): McpConfig | undefined => {
  if (!isRecord(raw)) return undefined
  const type = raw["type"]
  if ((type === undefined || type === "stdio") && typeof raw["command"] === "string") {
    const args = Array.isArray(raw["args"])
      ? raw["args"].filter((arg): arg is string => typeof arg === "string")
      : []
    return { _tag: "stdio", command: raw["command"], args, env: stringMap(raw["env"]) }
  }
  if (typeof raw["url"] === "string") {
    // A remote server without a type is most likely the newer HTTP transport.
    const tag = type === "sse" ? "sse" : type === undefined || type === "http" ? "http" : undefined
    if (tag === undefined) return undefined
    return { _tag: tag, url: raw["url"], headers: stringMap(raw["headers"]) }
  }
  return undefined
}

export const writeMcpConfig = (config: McpConfig): Record<string, unknown> =>
  config._tag === "stdio"
    ? { type: "stdio", command: config.command, args: config.args, env: config.env }
    : { type: config._tag, url: config.url, headers: config.headers }

/** The servers of a `{ "mcpServers": { … } }` document; unreadable entries are skipped. */
export const readMcpServers = (document: unknown): ReadonlyArray<[string, McpConfig]> => {
  if (!isRecord(document) || !isRecord(document["mcpServers"])) return []
  return Object.entries(document["mcpServers"]).flatMap(([name, raw]) => {
    const config = readMcpConfig(raw)
    return config === undefined ? [] : [[name, config] as [string, McpConfig]]
  })
}

/** What the UI sees: names of variables and headers, never their values. */
export const mcpServerView = (
  name: string,
  config: McpConfig,
  source: McpServer["source"],
  enabled: boolean,
): McpServer => ({
  name,
  source,
  enabled,
  transport:
    config._tag === "stdio"
      ? {
          _tag: "stdio",
          command: config.command,
          args: [...config.args],
          env: Object.keys(config.env),
        }
      : { _tag: config._tag, url: config.url, headers: Object.keys(config.headers) },
})

type Entry = { readonly name: string; readonly value: string | null }

const resolveEntries = (
  entries: ReadonlyArray<Entry>,
  previous: Readonly<Record<string, string>>,
  what: string,
): { readonly values: Record<string, string> } | { readonly error: string } => {
  const values: Record<string, string> = {}
  for (const entry of entries) {
    if (Object.hasOwn(values, entry.name))
      return { error: `The ${what} ${entry.name} is listed twice.` }
    const value = entry.value ?? previous[entry.name]
    if (value === undefined) return { error: `Enter a value for the ${what} ${entry.name}.` }
    values[entry.name] = value
  }
  return { values }
}

/**
 * The configuration the human entered. A `null` value keeps the one saved
 * before under that name; there must be one.
 */
export const mcpConfigFromInput = (
  input: McpTransportInput,
  previous: McpConfig | undefined,
): { readonly config: McpConfig } | { readonly error: string } => {
  if (input._tag === "stdio") {
    const env = resolveEntries(
      input.env,
      previous?._tag === "stdio" ? previous.env : {},
      "environment variable",
    )
    if ("error" in env) return env
    return {
      config: {
        _tag: "stdio",
        command: input.command.trim(),
        args: [...input.args],
        env: env.values,
      },
    }
  }
  const headers = resolveEntries(
    input.headers,
    previous !== undefined && previous._tag !== "stdio" ? previous.headers : {},
    "header",
  )
  if ("error" in headers) return headers
  return { config: { _tag: input._tag, url: input.url.trim(), headers: headers.values } }
}

/**
 * The servers of a configuration pasted from a server's docs: the whole
 * `{ "mcpServers": { … } }` document, or just the map of names to servers.
 */
export const parseMcpImport = (
  json: string,
): { readonly servers: ReadonlyArray<[string, McpConfig]> } | { readonly error: string } => {
  let document: unknown
  try {
    document = JSON.parse(json)
  } catch {
    return {
      error:
        "That is not valid JSON. Paste the configuration exactly as the server's docs give it.",
    }
  }
  if (!isRecord(document)) return { error: "The configuration must be a JSON object." }
  if (readMcpConfig(document) !== undefined) {
    return {
      error: 'Give the server a name: wrap it as { "my-server": { … } } and paste it again.',
    }
  }
  const map = isRecord(document["mcpServers"]) ? document["mcpServers"] : document
  const entries = Object.entries(map)
  if (entries.length === 0) return { error: "The configuration has no MCP servers." }
  const servers: Array<[string, McpConfig]> = []
  for (const [name, raw] of entries) {
    if (!MCP_SERVER_NAME.test(name)) {
      return {
        error: `"${name}" is not a valid server name. Use letters, digits, "-" and "_" only.`,
      }
    }
    const config = readMcpConfig(raw)
    if (config === undefined) {
      return {
        error: `The server "${name}" needs a "command" (a local server) or a "url" with "type": "http" or "sse".`,
      }
    }
    servers.push([name, config])
  }
  return { servers }
}

/**
 * `${VAR}` and `${VAR:-default}` filled from the daemon's environment, as
 * Claude Code does for `.mcp.json`. An unset variable without a default stays
 * as written, so the server reports it rather than getting an empty value.
 */
export const expandEnv = (value: string, env: Readonly<Record<string, string | undefined>>) =>
  value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (whole, name: string, fallback: string | undefined) => env[name] ?? fallback ?? whole,
  )

const expandAll = (
  values: Readonly<Record<string, string>>,
  env: Readonly<Record<string, string | undefined>>,
) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, expandEnv(value, env)]))

/** The configuration as the agent is given it, with variables expanded. */
export const toAgentMcpServer = (
  config: McpConfig,
  env: Readonly<Record<string, string | undefined>>,
): AgentMcpServer =>
  config._tag === "stdio"
    ? {
        type: "stdio",
        command: expandEnv(config.command, env),
        args: config.args.map((arg) => expandEnv(arg, env)),
        env: expandAll(config.env, env),
      }
    : {
        type: config._tag,
        url: expandEnv(config.url, env),
        headers: expandAll(config.headers, env),
      }
