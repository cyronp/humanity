import { Schema } from "effect"
import { AgentProvider } from "./Provider.ts"

export const McpServerName = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/))
export type McpServerName = typeof McpServerName.Type

export const SkillName = Schema.String.check(
  Schema.isPattern(/^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/),
)
export type SkillName = typeof SkillName.Type

export const ExtensionSource = Schema.Literals(["humanity", "project"])
export type ExtensionSource = typeof ExtensionSource.Type

export const McpTransport = Schema.Union([
  Schema.TaggedStruct("stdio", {
    command: Schema.String,
    args: Schema.Array(Schema.String),
    env: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("http", {
    url: Schema.String,
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
  enabled: Schema.Boolean,
  transport: McpTransport,
})
export type McpServer = typeof McpServer.Type

export const EnvVarName = Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/))

export const HeaderName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/),
)

export const McpUrl = Schema.String.check(Schema.isPattern(/^https?:\/\/[^\s]{1,2048}$/))

export const McpEnvInput = Schema.Struct({ name: EnvVarName, value: Schema.NullOr(Schema.String) })
export type McpEnvInput = typeof McpEnvInput.Type

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

/** Humanity's own skills, a repository's, or the human's own, found in their agents' folders. */
export const SkillSource = Schema.Literals(["humanity", "project", "user"])
export type SkillSource = typeof SkillSource.Type

export const Skill = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  source: SkillSource,
  invocation: Schema.String,
  instructions: Schema.NullOr(Schema.String),
  /** Where it was found: a folder (`~/.codex/skills`, `.agents/skills`) or a Claude Code plugin. */
  location: Schema.String,
  /** The providers that load it themselves; the others get it from Humanity's `load_skill`. */
  nativeTo: Schema.Array(AgentProvider),
})
export type Skill = typeof Skill.Type

export const SkillInput = Schema.Struct({
  name: SkillName,
  description: Schema.String.check(Schema.isPattern(/^[^\r\n]{1,1024}$/)),
  instructions: Schema.String,
})
export type SkillInput = typeof SkillInput.Type

export const Extensions = Schema.Struct({
  mcpServers: Schema.Array(McpServer),
  skills: Schema.Array(Skill),
})
export type Extensions = typeof Extensions.Type

export const HUMANITY_PLUGIN_NAME = "humanity"
