import { useAtomSet } from "@effect/atom-react"
import { type Autonomy, newThreadAutonomy, type Project } from "@humanity/contracts"
import { Exit } from "effect"
import { useState } from "react"
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
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { AUTONOMY_OPTIONS } from "./AutonomyPicker.tsx"

/** The select's value for "no default of its own". */
const INHERIT = "inherit"

const labelOf = (autonomy: Autonomy) =>
  AUTONOMY_OPTIONS.find((option) => option.value === autonomy)?.label ?? autonomy

/**
 * The permissions a project's new threads start with: its own, or the human's
 * default for every project. A thread's own permissions are changed in its
 * message box and are not touched here.
 */
export function ProjectPermissions({ project }: { readonly project: Project }) {
  const save = useAtomSet(setDefaultAutonomyAtom, { mode: "promiseExit" })
  const { pinned } = usePinnedDefaults()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const change = async (value: string) => {
    const autonomy = AUTONOMY_OPTIONS.find((option) => option.value === value)?.value ?? null
    setPending(true)
    setError(undefined)
    const exit = await save({
      payload: { projectId: project.id, autonomy },
      reactivityKeys: [keys.projects],
    })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <section aria-labelledby="project-permissions" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id="project-permissions" className="text-sm font-medium">
            Permissions for new threads
          </h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            How much the agent does without asking when a thread starts in this project. Your own
            default is the mode you pinned in the message box, or Auto mode. Threads that already
            exist keep theirs.
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
