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
import { PinDefaultButton } from "@/components/PinDefaultButton"
import { usePinnedDefaults } from "@/features/home/pinnedDefaults"

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
 * beyond "Ask me" is coloured (amber for accepted edits, purple for auto mode),
 * so a loosened session is never mistaken for a reviewed one. A new thread
 * starts in the pinned mode, or the one the last thread was left in.
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
  const pins = usePinnedDefaults()
  const current = findOption(value) ?? ASK
  const Icon = current.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <InputGroupButton
          size="sm"
          className={cn(
            "text-muted-foreground hover:text-foreground",
            value === "accept_edits" && "text-amber-600 hover:text-amber-700 dark:text-amber-400",
            value === "auto" && "text-purple-600 hover:text-purple-700 dark:text-purple-400",
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
          <p role="alert" className="px-1.5 py-1 text-xs text-destructive">
            The default was not changed: {pins.error}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
