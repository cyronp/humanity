import type { ProjectId } from "@humanity/contracts"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

export const branchesAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query("Git.branches", { projectId }, { reactivityKeys: [keys.git(projectId)] }),
)

export const searchProjectFilesAtom = HumanityClient.mutation("Git.searchFiles")
