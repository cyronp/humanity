import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { Link } from "@tanstack/react-router"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { GitBranch, Link2, Trash2 } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { projectsAtom, removeProjectAtom } from "./atoms.ts"
import { ProjectIcon } from "./ProjectIcon.tsx"

export function ProjectList() {
  const result = useAtomValue(projectsAtom)

  return AsyncResult.match(result, {
    onInitial: () => (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    ),
    onFailure: (failure) => (
      <ErrorNote title="Could not load projects" message={describeCause(failure.cause)} />
    ),
    onSuccess: ({ value }) =>
      value.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No projects yet. Add a local repository to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {value.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      ),
  })
}

function ProjectCard({ project }: { readonly project: Project }) {
  const remove = useAtomSet(removeProjectAtom, { mode: "promiseExit" })
  const [error, setError] = useState<string>()

  const onRemove = async () => {
    const confirmed = window.confirm(
      `Remove "${project.name}" from Humanity?\n\nThe repository at ${project.localPath} is not touched.`,
    )
    if (!confirmed) return
    const exit = await remove({
      payload: { projectId: project.id },
      reactivityKeys: [keys.projects],
    })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ProjectIcon project={project} />
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="underline-offset-4 hover:underline"
          >
            {project.name}
          </Link>
          <Badge variant="secondary">
            <GitBranch />
            {project.defaultBranch}
          </Badge>
          {project.githubFullName !== null && (
            <Badge variant="outline">
              <Link2 />
              {project.githubFullName}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="font-mono text-xs break-all">
          {project.localPath}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/projects/$projectId" params={{ projectId: project.id }}>
              Open
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 />
            Remove
          </Button>
        </div>
        {error !== undefined && <ErrorNote title="Could not remove the project" message={error} />}
      </CardContent>
    </Card>
  )
}
