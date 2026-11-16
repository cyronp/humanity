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

/** The autonomy a project's new threads start with; `null` follows the human's default. */
export const setDefaultAutonomyAtom = HumanityClient.mutation("Projects.setDefaultAutonomy")

/** The favicon found in a project's repository, or `null`. Kept while the page is open. */
export const projectIconAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query("Projects.icon", { projectId }, { reactivityKeys: [keys.projects] }).pipe(
    Atom.keepAlive,
  ),
)

/** What the folder field is completing: the folder to list and the start of a name in it. */
export const folderQueryAtom = Atom.make<FolderQuery | undefined>(undefined)

/** The folders that complete `query`, with the query they answer, so a stale list is never misread. */
export interface FolderMatches {
  readonly query: FolderQuery
  readonly entries: ReadonlyArray<FolderEntry>
}

/**
 * The daemon's folders for the path being typed. A pause before asking keeps
 * keystrokes from each asking: a new query interrupts the one still waiting.
 * While the next list loads, the last one stays (as `waiting`).
 */
export const foldersAtom = HumanityClient.runtime.atom((get) => {
  const query = get(folderQueryAtom)
  if (query === undefined) return Effect.succeed<FolderMatches | undefined>(undefined)
  return Effect.sleep("120 millis").pipe(
    Effect.andThen(HumanityClient.use((client) => client("Projects.listFolders", query))),
    Effect.map((entries): FolderMatches | undefined => ({ query, entries })),
  )
})
