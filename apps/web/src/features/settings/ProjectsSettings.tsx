import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Plus } from "lucide-react"
import { type ReactNode, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ProjectPermissions } from "@/features/policy/ProjectPermissions"
import { openAddRepository } from "@/features/projects/addRepository"
import { projectsAtom, removeProjectAtom } from "@/features/projects/atoms"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import {
  ProjectModel,
  ProjectName,
  ProjectPullRequests,
  ProjectWorktrees,
} from "./ProjectOptions.tsx"
import { closeSettings, selectSettingsItem, useSettings } from "./settings.ts"
import { SettingsFrame, SettingsPane, SettingsSplit } from "./SettingsLayout.tsx"

export function ProjectsSettings() {
  const projects = useAtomValue(projectsAtom)

  const addRepository = () => {
    closeSettings()
    openAddRepository()
  }

  return (
    <SettingsFrame
      id="settings-projects"
      title="Projects"
      action={
        <Button variant="outline" size="sm" onClick={addRepository}>
          <Plus />
          Add repository
        </Button>
      }
    >
      {AsyncResult.isSuccess(projects) && projects.value.length > 0 ? (
        <ProjectList projects={projects.value} />
      ) : (
        <SettingsPane>
          <AsyncView result={projects} errorTitle="Could not load projects">
            {() => <p className="border-y py-4 text-sm text-muted-foreground">No projects yet.</p>}
          </AsyncView>
        </SettingsPane>
      )}
    </SettingsFrame>
  )
}

function ProjectList({ projects }: { readonly projects: ReadonlyArray<Project> }) {
  const { projectId: openProjectId } = useParams({ strict: false })
  const { items } = useSettings()
  const project =
    projects.find((candidate) => candidate.id === items.projects) ??
    projects.find((candidate) => candidate.id === openProjectId) ??
    projects[0]
  if (project === undefined) return null

  return (
    <SettingsSplit
      label="Projects"
      items={projects.map((candidate) => ({
        id: candidate.id,
        label: candidate.name,
        icon: <ProjectIcon project={candidate} className="size-7" />,
      }))}
      selected={project.id}
      onSelect={(id) => selectSettingsItem("projects", id)}
    >
      <ProjectDetail key={project.id} project={project} />
    </SettingsSplit>
  )
}

function ProjectDetail({ project }: { readonly project: Project }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b pb-3">
        <ProjectIcon project={project} className="size-4" />
        <h3 className="truncate text-sm font-medium">{project.name}</h3>
      </div>
      <dl className="divide-y border-b text-sm">
        <ProjectName project={project} />
        <Row label="Folder">
          <code className="font-mono text-xs break-all">{project.localPath}</code>
        </Row>
        {project.githubFullName !== null && (
          <Row label="GitHub">
            <a
              href={`https://github.com/${project.githubFullName}`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {project.githubFullName}
            </a>
          </Row>
        )}
        {project.gitlab !== null && (
          <Row label="GitLab">
            <a
              href={`https://${project.gitlab.host}/${project.gitlab.fullPath}`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {project.gitlab.fullPath}
            </a>
          </Row>
        )}
        <Row label="Default branch">
          <code className="font-mono text-xs">{project.defaultBranch}</code>
        </Row>
      </dl>

      <div className="flex flex-col gap-5 border-b py-5">
        <ProjectPermissions project={project} />
        <ProjectModel project={project} />
      </div>

      <div className="flex flex-col border-b py-5">
        <ProjectWorktrees project={project} />
        <ProjectPullRequests project={project} />
      </div>

      <div className="flex flex-wrap items-center gap-3 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">Remove this project</span>
          <span className="text-sm text-muted-foreground">
            Deletes its threads. The repository is not touched.
          </span>
        </div>
        <RemoveProject project={project} />
      </div>
    </div>
  )
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 py-2">
      <dt className="shrink-0">{label}</dt>
      <dd className="flex min-w-0 justify-end text-right">{children}</dd>
    </div>
  )
}

function RemoveProject({ project }: { readonly project: Project }) {
  const remove = useAtomSet(removeProjectAtom, { mode: "promiseExit" })
  const navigate = useNavigate()
  const { projectId: openProjectId } = useParams({ strict: false })
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [removing, setRemoving] = useState(false)

  const confirm = async () => {
    setRemoving(true)
    const exit = await remove({
      payload: { projectId: project.id },
      reactivityKeys: [keys.projects],
    })
    setRemoving(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    setOpen(false)
    if (openProjectId === project.id) void navigate({ to: "/" })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(undefined)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Remove project
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{project.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Its threads and the worktrees Humanity made for them are deleted. The repository at{" "}
            <code className="break-all">{project.localPath}</code> is not touched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== undefined && <ErrorNote title="Could not remove the project" message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={() => void confirm()} disabled={removing}>
            Remove project
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
