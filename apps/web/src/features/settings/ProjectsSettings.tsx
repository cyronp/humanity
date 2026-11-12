import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Exit } from "effect"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ProjectPolicy } from "@/features/policy/ProjectPolicy"
import { openAddRepository } from "@/features/projects/addRepository"
import { projectsAtom, removeProjectAtom } from "@/features/projects/atoms"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { closeSettings } from "./settings.ts"

/** The projects Humanity works on: one at a time, with its tool policy and the way to remove it. */
export function ProjectsSettings() {
  const projects = useAtomValue(projectsAtom)

  const addRepository = () => {
    closeSettings()
    openAddRepository()
  }

  return (
    <section aria-labelledby="settings-projects" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="settings-projects" className="text-base font-medium">
            Projects
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            The repositories Humanity works on, each with its own rules for what the agent may do
            without asking.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addRepository}>
          <Plus />
          Add repository
        </Button>
      </div>
      <AsyncView result={projects} errorTitle="Could not load projects">
        {(list) =>
          list.length === 0 ? (
            <p className="border-y py-4 text-sm text-muted-foreground">
              No projects yet. Add a repository to start working on it.
            </p>
          ) : (
            <ProjectSettings projects={list} />
          )
        }
      </AsyncView>
    </section>
  )
}

function ProjectSettings({ projects }: { readonly projects: ReadonlyArray<Project> }) {
  const { projectId: openProjectId } = useParams({ strict: false })
  const [chosenId, setChosenId] = useState<string>()
  // Until one is picked, the project of the page behind the settings; else the first.
  const project =
    projects.find((candidate) => candidate.id === chosenId) ??
    projects.find((candidate) => candidate.id === openProjectId) ??
    projects[0]
  if (project === undefined) return null

  return (
    <div className="flex flex-col">
      <dl className="divide-y border-y text-sm">
        <Row label="Project">
          <Select value={project.id} onValueChange={setChosenId}>
            <SelectTrigger className="max-w-64" aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {projects.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  <ProjectIcon project={candidate} className="size-4" />
                  <span className="truncate">{candidate.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
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
        <Row label="Default branch">
          <code className="font-mono text-xs">{project.defaultBranch}</code>
        </Row>
      </dl>

      <div className="border-b py-5">
        <ProjectPolicy key={project.id} project={project} />
      </div>

      <div className="flex flex-wrap items-center gap-3 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">Remove this project</span>
          <span className="text-sm text-muted-foreground">
            Its threads go with it. The repository in its folder is not touched.
          </span>
        </div>
        <RemoveProject
          key={project.id}
          project={project}
          onRemoved={() => setChosenId(undefined)}
        />
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

/** Asks before removing: the project's threads and their history go with it. */
function RemoveProject({
  project,
  onRemoved,
}: {
  readonly project: Project
  readonly onRemoved: () => void
}) {
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
    onRemoved()
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
