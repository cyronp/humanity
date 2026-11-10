import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CloneFromGitHubCard } from "@/features/github/CloneFromGitHubCard"
import { AppHeader } from "@/features/layout/AppHeader"
import { PageBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { AddLocalProjectForm } from "@/features/projects/AddLocalProjectForm"
import { ProjectList } from "@/features/projects/ProjectList"

export const Route = createFileRoute("/projects/")({
  component: ProjectsPage,
})

function ProjectsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pt-14 pb-6">
      <AppHeader>
        <PageBreadcrumb page="Projects" />
      </AppHeader>
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <ProjectList />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Add a local project</CardTitle>
          <CardDescription>Point Humanity at a git repository on this machine.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddLocalProjectForm />
        </CardContent>
      </Card>
      <CloneFromGitHubCard />
    </main>
  )
}
