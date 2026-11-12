import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  Extensions,
  McpServer,
  McpServerName,
  McpTransportInput,
  Skill,
  SkillInput,
  SkillName,
} from "../domain/Extensions.ts"
import { ProjectId } from "../domain/Project.ts"
import { ExtensionInvalid, ExtensionNotFound, ProjectNotFound } from "../Errors.ts"

/**
 * MCP servers and skills. Changes reach open threads before their next
 * message; every MCP tool call still goes through the project's policy.
 */
export const ExtensionsRpcs = RpcGroup.make(
  /** Humanity's own MCP servers and skills, plus the project's when one is given. */
  Rpc.make("Extensions.list", {
    payload: { projectId: Schema.NullOr(ProjectId) },
    success: Extensions,
    error: ProjectNotFound,
  }),
  /**
   * Adds a server, or replaces `previousName`'s (renaming it when the names
   * differ). A `null` value keeps the variable or header saved before.
   */
  Rpc.make("Extensions.saveMcpServer", {
    payload: {
      previousName: Schema.NullOr(McpServerName),
      name: McpServerName,
      transport: McpTransportInput,
    },
    success: McpServer,
    error: Schema.Union([ExtensionInvalid, ExtensionNotFound]),
  }),
  /**
   * Adds every server of a JSON configuration pasted from a server's docs:
   * `{ "mcpServers": { … } }` or the bare map of names to configurations.
   */
  Rpc.make("Extensions.importMcpServers", {
    payload: { json: Schema.String },
    success: Schema.Array(McpServer),
    error: ExtensionInvalid,
  }),
  Rpc.make("Extensions.setMcpServerEnabled", {
    payload: { name: McpServerName, enabled: Schema.Boolean },
    success: McpServer,
    error: ExtensionNotFound,
  }),
  Rpc.make("Extensions.removeMcpServer", {
    payload: { name: McpServerName },
    error: ExtensionNotFound,
  }),
  /** Adds a skill, or replaces `previousName`'s (renaming it when the names differ). */
  Rpc.make("Extensions.saveSkill", {
    payload: { previousName: Schema.NullOr(SkillName), skill: SkillInput },
    success: Skill,
    error: Schema.Union([ExtensionInvalid, ExtensionNotFound]),
  }),
  Rpc.make("Extensions.removeSkill", {
    payload: { name: SkillName },
    error: ExtensionNotFound,
  }),
)
