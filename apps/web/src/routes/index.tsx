import { createFileRoute, redirect } from "@tanstack/react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CloneFromGitHubCard } from "@/features/github/CloneFromGitHubCard"
import { hasCompletedOnboarding } from "@/features/onboarding/onboarding"
import { AddLocalProjectForm } from "@/features/projects/AddLocalProjectForm"
import { ProjectList } from "@/features/projects/ProjectList"

export const Route = createFileRoute("/")({
  // First visit in this browser: show the setup guide before the empty project list.
  beforeLoad: () => {
    if (!hasCompletedOnboarding()) throw redirect({ to: "/welcome" })
  },
  component: ProjectsPage,
})

function ProjectsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
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
