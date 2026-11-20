import { ProjectId } from "@humanity/contracts"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { NewChat } from "@/features/home/NewChat"

interface HomeSearch {
  readonly project?: ProjectId | undefined
  /** What the composer starts with, such as a pull request a new thread is about. */
  readonly prompt?: string | undefined
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    ...(typeof search["project"] === "string" && search["project"] !== ""
      ? { project: ProjectId.make(search["project"]) }
      : {}),
    ...(typeof search["prompt"] === "string" && search["prompt"] !== ""
      ? { prompt: search["prompt"] }
      : {}),
  }),
  component: HomePage,
})

function HomePage() {
  const { project, prompt } = Route.useSearch()
  const navigate = useNavigate({ from: "/" })
  // The prompt fills the composer once; it leaves the address so a reload does not fill it again.
  const [initialPrompt] = useState(prompt)
  useEffect(() => {
    if (prompt !== undefined) {
      void navigate({ search: (previous) => ({ ...previous, prompt: undefined }), replace: true })
    }
  }, [prompt, navigate])
  return <NewChat projectId={project} initialPrompt={initialPrompt} />
}
