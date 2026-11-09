import type { ProjectId } from "@humanity/contracts"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

export const branchesAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query("Git.branches", { projectId }, { reactivityKeys: [keys.git(projectId)] }),
)

export const statusAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query("Git.status", { projectId }, { reactivityKeys: [keys.git(projectId)] }),
)

export const workingTreeDiffAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query("Git.diff", { projectId }, { reactivityKeys: [keys.git(projectId)] }),
)

export const createBranchAtom = HumanityClient.mutation("Git.createBranch")
