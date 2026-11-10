import { ProjectId } from "@humanity/contracts"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { NewChat } from "@/features/home/NewChat"
import { hasCompletedOnboarding } from "@/features/onboarding/onboarding"

/** `?project=<id>` opens the new thread in that project instead of the last prompted one. */
interface HomeSearch {
  readonly project?: ProjectId | undefined
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    typeof search["project"] === "string" && search["project"] !== ""
      ? { project: ProjectId.make(search["project"]) }
      : {},
  // First visit in this browser: show the setup guide before anything else.
  beforeLoad: () => {
    if (!hasCompletedOnboarding()) throw redirect({ to: "/welcome" })
  },
  component: HomePage,
})

function HomePage() {
  const { project } = Route.useSearch()
  return <NewChat projectId={project} />
}
