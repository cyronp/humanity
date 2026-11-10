import type { Project } from "@humanity/contracts"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"
import { AsyncView } from "@/components/AsyncView"
import { BranchesCard } from "@/features/git/BranchesCard"
import { PolicyCard } from "@/features/policy/PolicyCard"
import { StatusCard } from "@/features/git/StatusCard"
import { useProject } from "@/features/projects/useProject"
import { SessionsCard } from "@/features/session/SessionsCard"

export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectPage,
})

function ProjectPage() {
  const { projectId } = Route.useParams()
  const project = useProject(projectId)
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Link
        to="/"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Projects
      </Link>
      <AsyncView result={project} errorTitle="Could not load the project">
        {(value) =>
          value === null ? (
            <p className="text-sm text-muted-foreground">
              This project does not exist. It may have been removed.
            </p>
          ) : (
            <ProjectOverview project={value} />
          )
        }
      </AsyncView>
    </main>
  )
}

function ProjectOverview({ project }: { readonly project: Project }) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        <code className="font-mono text-xs break-all text-muted-foreground">
          {project.localPath}
        </code>
      </header>
      <SessionsCard project={project} />
      <BranchesCard project={project} />
      <StatusCard project={project} />
      <PolicyCard project={project} />
    </>
  )
}
