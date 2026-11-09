import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { projectsAtom } from "./atoms.ts"

/**
 * One project out of the list query. `null` means the list loaded and the id
 * is not in it; the list's own loading and failure states pass through.
 */
export const useProject = (projectId: string) => {
  const projects = useAtomValue(projectsAtom)
  return AsyncResult.map(
    projects,
    (list): Project | null => list.find((project) => project.id === projectId) ?? null,
  )
}
