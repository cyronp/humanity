import type { Project, SessionStatus } from "@humanity/contracts"
import { ListFilter } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import {
  DEFAULT_THREAD_FILTER,
  isDefaultFilter,
  STATUS_OPTIONS,
  type ThreadFilter,
} from "./threadFilter.ts"

const toggle = <A,>(items: ReadonlyArray<A>, item: A, on: boolean): ReadonlyArray<A> =>
  on ? [...items.filter((candidate) => candidate !== item), item] : items.filter((x) => x !== item)

export function ThreadFilterMenu({
  filter,
  onChange,
  projects,
}: {
  readonly filter: ThreadFilter
  readonly onChange: (filter: ThreadFilter) => void
  readonly projects: ReadonlyArray<Project>
}) {
  const narrowed = !isDefaultFilter(filter)
  // Keeps the menu open while several boxes are ticked in a row.
  const keepOpen = (event: Event) => event.preventDefault()
  const projectSummary =
    filter.projectIds.length === 0 ? "All" : `${filter.projectIds.length} selected`
  const statusSummary = `${filter.statuses.length} of ${STATUS_OPTIONS.length}`

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={narrowed ? "Filter threads (filters on)" : "Filter threads"}
            >
              <ListFilter />
              {narrowed && (
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Filter and sort</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Projects
              <span className="ml-auto text-xs text-muted-foreground">{projectSummary}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56 **:data-[slot=scroll-area-viewport]:max-h-80">
              <DropdownMenuCheckboxItem
                checked={filter.projectIds.length === 0}
                onSelect={keepOpen}
                onCheckedChange={() => onChange({ ...filter, projectIds: [] })}
              >
                All projects
              </DropdownMenuCheckboxItem>
              {projects.length > 0 && <DropdownMenuSeparator />}
              {projects.map((project) => (
                <DropdownMenuCheckboxItem
                  key={project.id}
                  checked={filter.projectIds.includes(project.id)}
                  onSelect={keepOpen}
                  onCheckedChange={(on) =>
                    onChange({ ...filter, projectIds: toggle(filter.projectIds, project.id, on) })
                  }
                >
                  <ProjectIcon project={project} className="size-4" />
                  <span className="truncate">{project.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              State
              <span className="ml-auto text-xs text-muted-foreground">{statusSummary}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {STATUS_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={filter.statuses.includes(option.value)}
                  onSelect={keepOpen}
                  onCheckedChange={(on) =>
                    onChange({
                      ...filter,
                      statuses: toggle<SessionStatus>(filter.statuses, option.value, on),
                    })
                  }
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Last activity</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={filter.order}
            onValueChange={(order) =>
              onChange({ ...filter, order: order === "oldest" ? "oldest" : "newest" })
            }
          >
            <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {narrowed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(DEFAULT_THREAD_FILTER)}>
              Reset filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
