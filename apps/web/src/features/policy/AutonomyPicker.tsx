import type { Autonomy } from "@humanity/contracts"
import { cn } from "cn"
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

interface AutonomyOption {
  readonly value: Autonomy
  readonly label: string
  readonly description: string
  readonly icon: LucideIcon
}

const ASK: AutonomyOption = {
  value: "ask",
  label: "Ask me",
  description: "Follow the project's policy: you review every edit and confirm every command.",
  icon: Hand,
}

/** In the order of how much the agent may do on its own. */
export const AUTONOMY_OPTIONS: ReadonlyArray<AutonomyOption> = [
  ASK,
  {
    value: "accept_edits",
    label: "Accept edits",
    description: "Edits inside the worktree are applied without review. Commands still ask.",
    icon: FilePen,
  },
  {
    value: "auto",
    label: "Auto mode",
    description: "Edits, commands, web and MCP tools run without asking. Denied tools stay denied.",
    icon: Zap,
  },
]

const findOption = (value: string): AutonomyOption | undefined =>
  AUTONOMY_OPTIONS.find((option) => option.value === value)

/**
 * How much the agent may do without the human, for one session. Anything
 * beyond "Ask me" is shown in amber, so a loosened session is never mistaken
 * for a reviewed one.
 */
export function AutonomyPicker({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: Autonomy
  readonly onChange: (autonomy: Autonomy) => void
  readonly disabled?: boolean
}) {
  const current = findOption(value) ?? ASK
  const Icon = current.icon
  const loosened = value !== "ask"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <InputGroupButton
          size="sm"
          className={cn(
            "text-muted-foreground hover:text-foreground",
            loosened && "text-amber-600 hover:text-amber-700 dark:text-amber-400",
          )}
          aria-label={`Autonomy: ${current.label}`}
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
            <DropdownMenuLabel>What the agent may do without asking</DropdownMenuLabel>
            {AUTONOMY_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="items-start"
              >
                <option.icon className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
