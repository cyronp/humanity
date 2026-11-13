import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { Check, ChevronsUpDown, FolderGit2, Plus } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { openAddRepository } from "@/features/projects/addRepository"
import { projectsAtom } from "@/features/projects/atoms"
import { ProjectIcon } from "@/features/projects/ProjectIcon"

/** `project ▾ / page`: the project switcher, then where in it the human is. */
export function ProjectBreadcrumb({
  project,
  page,
}: {
  readonly project: Project | undefined
  readonly page?: string | undefined
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem>
          <ProjectSwitcher current={project} />
        </BreadcrumbItem>
        {page !== undefined && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate" title={page}>
                {page}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Picking a project opens a new thread in it; "Add repository" brings in another one. */
function ProjectSwitcher({ current }: { readonly current: Project | undefined }) {
  const projects = useAtomValue(projectsAtom)
  const navigate = useNavigate()
  const list = AsyncResult.isSuccess(projects) ? projects.value : []

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-1 max-w-56 gap-2 px-2 text-foreground">
          {current === undefined ? (
            <FolderGit2 className="text-muted-foreground" />
          ) : (
            <ProjectIcon project={current} className="size-4" />
          )}
          <span className="truncate">{current?.name ?? "Add a repository"}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {list.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              New thread in
            </DropdownMenuLabel>
            {list.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onSelect={() => void navigate({ to: "/", search: { project: project.id } })}
              >
                <ProjectIcon project={project} className="size-4" />
                <span className="truncate">{project.name}</span>
                {project.id === current?.id && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={openAddRepository}>
          <Plus />
          Add repository
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
