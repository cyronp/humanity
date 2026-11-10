import type { Project } from "@humanity/contracts"
import { createFileRoute } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { AsyncView } from "@/components/AsyncView"
import { BranchesCard } from "@/features/git/BranchesCard"
import { GitHubBranchesCard } from "@/features/github/GitHubBranchesCard"
import { StatusCard } from "@/features/git/StatusCard"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { PolicyCard } from "@/features/policy/PolicyCard"
import { useProject } from "@/features/projects/useProject"
import { DecisionHistoryCard } from "@/features/session/DecisionHistoryCard"
import { SessionsCard } from "@/features/session/SessionsCard"

export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectPage,
})

function ProjectPage() {
  const { projectId } = Route.useParams()
  const project = useProject(projectId)
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pt-14 pb-6">
      <AppHeader>
        <ProjectBreadcrumb
          project={AsyncResult.isSuccess(project) ? (project.value ?? undefined) : undefined}
          page="Settings"
        />
      </AppHeader>
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
      {project.githubFullName !== null && (
        <GitHubBranchesCard project={project} fullName={project.githubFullName} />
      )}
      <StatusCard project={project} />
      <PolicyCard project={project} />
      <DecisionHistoryCard project={project} />
    </>
  )
}
