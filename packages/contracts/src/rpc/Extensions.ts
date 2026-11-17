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

export const ExtensionsRpcs = RpcGroup.make(
  Rpc.make("Extensions.list", {
    payload: { projectId: Schema.NullOr(ProjectId) },
    success: Extensions,
    error: ProjectNotFound,
  }),
  Rpc.make("Extensions.saveMcpServer", {
    payload: {
      previousName: Schema.NullOr(McpServerName),
      name: McpServerName,
      transport: McpTransportInput,
    },
    success: McpServer,
    error: Schema.Union([ExtensionInvalid, ExtensionNotFound]),
  }),
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
