import { type Autonomy, newThreadAutonomy, type Project } from "@humanity/contracts"
import { ErrorNote } from "@/components/ErrorNote"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePinnedDefaults } from "@/features/home/pinnedDefaults"
import { setDefaultAutonomyAtom } from "@/features/projects/atoms"
import { keys } from "@/lib/rpc"
import { AUTONOMY_OPTIONS } from "./AutonomyPicker.tsx"
import { useAction } from "@/lib/useAction"

const INHERIT = "inherit"

const labelOf = (autonomy: Autonomy) =>
  AUTONOMY_OPTIONS.find((option) => option.value === autonomy)?.label ?? autonomy

export function ProjectPermissions({ project }: { readonly project: Project }) {
  const { run: save, error, pending } = useAction(setDefaultAutonomyAtom)
  const { pinned } = usePinnedDefaults()

  const change = async (value: string) => {
    const autonomy = AUTONOMY_OPTIONS.find((option) => option.value === value)?.value ?? null
    await save({
      payload: { projectId: project.id, autonomy },
      reactivityKeys: [keys.projects],
    })
  }

  return (
    <section aria-labelledby="project-permissions" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id="project-permissions" className="text-sm font-medium">
            Permissions for new threads
          </h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            Existing threads keep their own.
          </p>
        </div>
        <Select
          value={project.defaultAutonomy ?? INHERIT}
          onValueChange={(value) => void change(value)}
          disabled={pending}
        >
          <SelectTrigger className="w-56" aria-labelledby="project-permissions">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT}>
              My default ({labelOf(newThreadAutonomy(undefined, pinned))})
            </SelectItem>
            {AUTONOMY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <option.icon />
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error !== undefined && (
        <ErrorNote title="The permissions were not changed" message={error} />
      )}
    </section>
  )
}
