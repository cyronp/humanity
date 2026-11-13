import type { ProjectId } from "@humanity/contracts"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

export const projectsAtom = HumanityClient.query("Projects.list", undefined, {
  reactivityKeys: [keys.projects],
})

export const addLocalProjectAtom = HumanityClient.mutation("Projects.addLocal")

export const removeProjectAtom = HumanityClient.mutation("Projects.remove")

/** The autonomy a project's new threads start with; `null` follows the human's default. */
export const setDefaultAutonomyAtom = HumanityClient.mutation("Projects.setDefaultAutonomy")

/** The favicon found in a project's repository, or `null`. Kept while the page is open. */
export const projectIconAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query("Projects.icon", { projectId }, { reactivityKeys: [keys.projects] }).pipe(
    Atom.keepAlive,
  ),
)
