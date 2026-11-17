import type { FolderEntry, ProjectId } from "@humanity/contracts"
import { Effect } from "effect"
import { Atom } from "effect/reactivity"
import type { FolderQuery } from "@/features/github/repoInput"
import { HumanityClient, keys } from "@/lib/rpc"

export const projectsAtom = HumanityClient.query("Projects.list", undefined, {
  reactivityKeys: [keys.projects],
})

export const addLocalProjectAtom = HumanityClient.mutation("Projects.addLocal")

export const removeProjectAtom = HumanityClient.mutation("Projects.remove")

export const setDefaultAutonomyAtom = HumanityClient.mutation("Projects.setDefaultAutonomy")

export const projectIconAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query("Projects.icon", { projectId }, { reactivityKeys: [keys.projects] }).pipe(
    Atom.keepAlive,
  ),
)

export const folderQueryAtom = Atom.make<FolderQuery | undefined>(undefined)

export interface FolderMatches {
  readonly query: FolderQuery
  readonly entries: ReadonlyArray<FolderEntry>
}

export const foldersAtom = HumanityClient.runtime.atom((get) => {
  const query = get(folderQueryAtom)
  if (query === undefined) return Effect.succeed<FolderMatches | undefined>(undefined)
  return Effect.sleep("120 millis").pipe(
    Effect.andThen(HumanityClient.use((client) => client("Projects.listFolders", query))),
    Effect.map((entries): FolderMatches | undefined => ({ query, entries })),
  )
})
