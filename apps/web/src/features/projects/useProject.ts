import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { projectsAtom } from "./atoms.ts"

export const useProject = (projectId: string) => {
  const projects = useAtomValue(projectsAtom)
  return AsyncResult.map(
    projects,
    (list): Project | null => list.find((project) => project.id === projectId) ?? null,
  )
}
