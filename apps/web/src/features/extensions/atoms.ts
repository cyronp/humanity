import type { ProjectId } from "@humanity/contracts"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

/** Humanity's own MCP servers and skills, plus the project's when one is given. */
export const extensionsAtom = Atom.family((projectId: ProjectId | null) =>
  HumanityClient.query("Extensions.list", { projectId }, { reactivityKeys: [keys.extensions] }),
)

export const saveMcpServerAtom = HumanityClient.mutation("Extensions.saveMcpServer")
export const importMcpServersAtom = HumanityClient.mutation("Extensions.importMcpServers")
export const setMcpServerEnabledAtom = HumanityClient.mutation("Extensions.setMcpServerEnabled")
export const removeMcpServerAtom = HumanityClient.mutation("Extensions.removeMcpServer")
export const saveSkillAtom = HumanityClient.mutation("Extensions.saveSkill")
export const removeSkillAtom = HumanityClient.mutation("Extensions.removeSkill")
