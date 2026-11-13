import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Plus } from "lucide-react"
import { type ReactNode, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ProjectPermissions } from "@/features/policy/ProjectPermissions"
import { openAddRepository } from "@/features/projects/addRepository"
import { projectsAtom, removeProjectAtom } from "@/features/projects/atoms"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { closeSettings, selectSettingsItem, useSettings } from "./settings.ts"
import { SettingsFrame, SettingsPane, SettingsSplit } from "./SettingsLayout.tsx"

/**
 * The projects Humanity works on, listed on the left; the chosen one's facts,
 * permissions and removal on the right.
 */
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
      description="The repositories Humanity works on, each with its own rules for what the agent may do without asking."
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
            {() => (
              <p className="border-y py-4 text-sm text-muted-foreground">
                No projects yet. Add a repository to start working on it.
              </p>
            )}
          </AsyncView>
        </SettingsPane>
      )}
    </SettingsFrame>
  )
}

function ProjectList({ projects }: { readonly projects: ReadonlyArray<Project> }) {
  const { projectId: openProjectId } = useParams({ strict: false })
  const { items } = useSettings()
  // Until one is picked (or once the picked one is removed), the project of
  // the page behind the settings; else the first.
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

      <div className="border-b py-5">
        <ProjectPermissions project={project} />
      </div>

      <div className="flex flex-wrap items-center gap-3 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">Remove this project</span>
          <span className="text-sm text-muted-foreground">
            Its threads go with it. The repository in its folder is not touched.
          </span>
        </div>
        <RemoveProject project={project} />
      </div>
    </div>
  )
}

/** One line of a project's facts: what it is on the left, its value on the right. */
function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 py-2">
      <dt className="shrink-0">{label}</dt>
      <dd className="flex min-w-0 justify-end text-right">{children}</dd>
    </div>
  )
}

/**
 * Asks before removing: the project's threads and their history go with it.
 * Once it is gone the list shows another project, since the picked one no longer matches.
 */
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
    // The page behind the settings showed a thread of this project: it is gone too.
    if (openProjectId === project.id) void navigate({ to: "/" })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(undefined)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Remove project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove “{project.name}”?</DialogTitle>
          <DialogDescription>
            Its threads, their history and the worktrees Humanity created for them are deleted. The
            repository at <code className="break-all">{project.localPath}</code> is not touched.
          </DialogDescription>
        </DialogHeader>
        {error !== undefined && <ErrorNote title="Could not remove the project" message={error} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" onClick={() => void confirm()} disabled={removing}>
            Remove project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
