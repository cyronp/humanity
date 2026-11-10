import type { ProjectId } from "@humanity/contracts"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

export const policyAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query(
    "Projects.getPolicy",
    { projectId },
    { reactivityKeys: [keys.policy(projectId)] },
  ),
)

export const setPolicyAtom = HumanityClient.mutation("Projects.setPolicy")
