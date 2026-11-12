import { ProjectId } from "@humanity/contracts"
import { createFileRoute } from "@tanstack/react-router"
import { NewChat } from "@/features/home/NewChat"

/** `?project=<id>` opens the new thread in that project instead of the last prompted one. */
interface HomeSearch {
  readonly project?: ProjectId | undefined
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    typeof search["project"] === "string" && search["project"] !== ""
      ? { project: ProjectId.make(search["project"]) }
      : {},
  component: HomePage,
})

function HomePage() {
  const { project } = Route.useSearch()
  return <NewChat projectId={project} />
}
