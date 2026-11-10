import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { Link, useNavigate } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { Check, ChevronsUpDown, FolderCog, FolderGit2 } from "lucide-react"
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

/** A page outside any project, such as the project list. */
export function PageBreadcrumb({ page }: { readonly page: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>{page}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Picking a project opens a new thread in it. */
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
          <span className="truncate">{current?.name ?? "Choose a project"}</span>
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
        {current !== undefined && (
          <DropdownMenuItem asChild>
            <Link to="/projects/$projectId" params={{ projectId: current.id }}>
              <FolderCog />
              {current.name} settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/projects">
            <FolderGit2 />
            {list.length === 0 ? "Add a project" : "Manage projects"}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
