import { Schema } from "effect"

/**
 * MCP servers and skills the agent can use. Humanity's own live in its data
 * folder and reach every project; a repository's own (`.mcp.json`,
 * `.claude/skills/`) are read, never written.
 */

/** A name Claude Code accepts for an MCP server. Its tools are then `mcp__<name>__<tool>`. */
export const McpServerName = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/))
export type McpServerName = typeof McpServerName.Type

/** A skill's name as SKILL.md requires it: lowercase words joined by hyphens, at most 64 characters. */
export const SkillName = Schema.String.check(
  Schema.isPattern(/^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/),
)
export type SkillName = typeof SkillName.Type

/** `humanity`: added in Humanity, for every project. `project`: found in the repository. */
export const ExtensionSource = Schema.Literals(["humanity", "project"])
export type ExtensionSource = typeof ExtensionSource.Type

/**
 * How Claude Code reaches an MCP server, as the UI sees it. Environment
 * variables and headers often carry tokens, so only their names leave the
 * daemon, never their values.
 */
export const McpTransport = Schema.Union([
  Schema.TaggedStruct("stdio", {
    command: Schema.String,
    args: Schema.Array(Schema.String),
    /** Names of the environment variables set for the server. */
    env: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("http", {
    url: Schema.String,
    /** Names of the headers sent to the server. */
    headers: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("sse", {
    url: Schema.String,
    headers: Schema.Array(Schema.String),
  }),
])
export type McpTransport = typeof McpTransport.Type

export const McpServer = Schema.Struct({
  name: Schema.String,
  source: ExtensionSource,
  /** A disabled server is kept in the settings but not given to the agent. Repository servers are always enabled. */
  enabled: Schema.Boolean,
  transport: McpTransport,
})
export type McpServer = typeof McpServer.Type

export const EnvVarName = Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/))

export const HeaderName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/),
)

/** An `http://` or `https://` URL. */
export const McpUrl = Schema.String.check(Schema.isPattern(/^https?:\/\/[^\s]{1,2048}$/))

/**
 * An environment variable the human enters. A `null` value keeps the one
 * saved before under that name, so editing a server never needs its tokens
 * sent back to the UI.
 */
export const McpEnvInput = Schema.Struct({ name: EnvVarName, value: Schema.NullOr(Schema.String) })
export type McpEnvInput = typeof McpEnvInput.Type

/** A header the human enters; a `null` value keeps the saved one, like `McpEnvInput`. */
export const McpHeaderInput = Schema.Struct({
  name: HeaderName,
  value: Schema.NullOr(Schema.String),
})
export type McpHeaderInput = typeof McpHeaderInput.Type

export const McpTransportInput = Schema.Union([
  Schema.TaggedStruct("stdio", {
    command: Schema.NonEmptyString,
    args: Schema.Array(Schema.String),
    env: Schema.Array(McpEnvInput),
  }),
  Schema.TaggedStruct("http", { url: McpUrl, headers: Schema.Array(McpHeaderInput) }),
  Schema.TaggedStruct("sse", { url: McpUrl, headers: Schema.Array(McpHeaderInput) }),
])
export type McpTransportInput = typeof McpTransportInput.Type

export const Skill = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  source: ExtensionSource,
  /** What runs it from the message box, e.g. `/humanity:review-sql` or `/deploy`. */
  invocation: Schema.String,
  /** The SKILL.md body, for editing. `null` for repository skills, which are read-only here. */
  instructions: Schema.NullOr(Schema.String),
})
export type Skill = typeof Skill.Type

export const SkillInput = Schema.Struct({
  name: SkillName,
  description: Schema.String.check(Schema.isPattern(/^[^\r\n]{1,1024}$/)),
  instructions: Schema.String,
})
export type SkillInput = typeof SkillInput.Type

/** Everything the agent of a project can use: Humanity's own first, then the repository's. */
export const Extensions = Schema.Struct({
  mcpServers: Schema.Array(McpServer),
  skills: Schema.Array(Skill),
})
export type Extensions = typeof Extensions.Type

/** The plugin Humanity's own skills are loaded as; they are invoked as `/<plugin>:<skill>`. */
export const HUMANITY_PLUGIN_NAME = "humanity"
