import { useAtomValue } from "@effect/atom-react"
import type { ProjectId, SessionId } from "@humanity/contracts"
import { Link } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import type { ReactNode } from "react"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { useProject } from "@/features/projects/useProject"
import { allSessionsAtom } from "./atoms.ts"

/**
 * A link to a thread inside running text: its project's icon and its title,
 * which follows the thread if it is renamed. `children` is what the text
 * called it, shown until (or unless) the thread is known.
 */
export function ThreadMention({
  projectId,
  sessionId,
  children,
}: {
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  readonly children?: ReactNode
}) {
  const sessions = useAtomValue(allSessionsAtom)
  const project = useProject(projectId)
  const session = AsyncResult.isSuccess(sessions)
    ? sessions.value.find((candidate) => candidate.id === sessionId)
    : undefined
  const name = AsyncResult.isSuccess(project) ? (project.value?.name ?? "") : ""
  return (
    <Link
      to="/projects/$projectId/sessions/$sessionId"
      params={{ projectId, sessionId }}
      {...(name === "" ? {} : { title: `Thread in ${name}` })}
      className="wrap-anywhere rounded-sm font-medium text-primary underline decoration-primary/30 underline-offset-4 outline-hidden transition-colors hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ProjectIcon
        project={{ id: projectId, name }}
        className="mr-1 inline-flex size-[1.1em] align-[-0.15em]"
      />
      {session?.title ?? children}
    </Link>
  )
}
