import { useAtomValue } from "@effect/atom-react"
import { type Autonomy, newThreadAutonomy } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { FilePen, Hand, type LucideIcon, Zap } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InputGroupButton } from "@/components/ui/input-group"
import { InlineError } from "@/components/InlineError"
import { PinDefaultButton } from "@/components/PinDefaultButton"
import { usePinnedDefaults } from "@/features/home/pinnedDefaults"
import { projectsAtom } from "@/features/projects/atoms"

interface AutonomyOption {
  readonly value: Autonomy
  readonly label: string
  readonly description: string
  readonly icon: LucideIcon
}

const ASK: AutonomyOption = {
  value: "ask",
  label: "Ask me",
  description: "Asks before file changes and commands.",
  icon: Hand,
}

const AUTO: AutonomyOption = {
  value: "auto",
  label: "Auto mode",
  description: "Runs everything without asking.",
  icon: Zap,
}

export const AUTONOMY_OPTIONS: ReadonlyArray<AutonomyOption> = [
  ASK,
  {
    value: "accept_edits",
    label: "Accept edits",
    description: "Applies file changes without asking. Commands still ask.",
    icon: FilePen,
  },
  AUTO,
]

const findOption = (value: string): AutonomyOption | undefined =>
  AUTONOMY_OPTIONS.find((option) => option.value === value)

export function AutonomyPicker({
  value,
  projectId,
  onChange,
  disabled = false,
}: {
  readonly value: Autonomy
  readonly projectId: string | undefined
  readonly onChange: (autonomy: Autonomy) => void
  readonly disabled?: boolean
}) {
  const pins = usePinnedDefaults()
  const projects = useAtomValue(projectsAtom)
  const project = AsyncResult.isSuccess(projects)
    ? projects.value.find((candidate) => candidate.id === projectId)
    : undefined
  const usual = newThreadAutonomy(project, pins.pinned)
  const tone = pins.ready && value !== usual ? value : undefined
  const current = findOption(value) ?? AUTO
  const Icon = current.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <InputGroupButton
          variant="muted"
          size="sm"
          className={cn(
            tone === "ask" && "text-sky-600 hover:text-sky-700 dark:text-sky-400",
            tone === "accept_edits" && "text-amber-600 hover:text-amber-700 dark:text-amber-400",
            tone === "auto" && "text-purple-600 hover:text-purple-700 dark:text-purple-400",
          )}
          aria-label={`Autonomy: ${current.label}`}
          title={tone === undefined ? undefined : "Not this project's usual permissions"}
        >
          <Icon />
          <span className="text-xs">{current.label}</span>
        </InputGroupButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const option = findOption(next)
            if (option !== undefined) onChange(option.value)
          }}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>Permissions</DropdownMenuLabel>
            {AUTONOMY_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="items-start"
              >
                <option.icon className="mt-0.5" />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </span>
                <PinDefaultButton
                  label={option.label}
                  pinned={pins.pinned.autonomy === option.value}
                  disabled={!pins.ready}
                  onToggle={() => void pins.toggle("autonomy", option.value)}
                />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuRadioGroup>
        {pins.error !== undefined && (
          <InlineError className="px-1.5 py-1">
            The default was not changed: {pins.error}
          </InlineError>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
