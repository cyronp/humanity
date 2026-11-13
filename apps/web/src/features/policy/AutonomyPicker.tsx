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
  description: "File changes and commands wait for you to allow or deny them.",
  icon: Hand,
}

const AUTO: AutonomyOption = {
  value: "auto",
  label: "Auto mode",
  description: "Edits, commands, web and MCP tools run without asking.",
  icon: Zap,
}

/** In the order of how much the agent may do on its own. */
export const AUTONOMY_OPTIONS: ReadonlyArray<AutonomyOption> = [
  ASK,
  {
    value: "accept_edits",
    label: "Accept edits",
    description:
      "File changes in the thread's folder are applied without asking. Commands still ask.",
    icon: FilePen,
  },
  AUTO,
]

const findOption = (value: string): AutonomyOption | undefined =>
  AUTONOMY_OPTIONS.find((option) => option.value === value)

/**
 * How much the agent does without the human, for one session. Auto mode is the
 * usual one and reads plain; a thread that asks is coloured (sky for "Ask me",
 * amber for accepted edits), so it is never mistaken for one that runs on its
 * own. A new thread starts in its project's mode, else the pinned one, else
 * Auto mode.
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
  const current = findOption(value) ?? AUTO
  const Icon = current.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <InputGroupButton
          size="sm"
          className={cn(
            "text-muted-foreground hover:text-foreground",
            value === "ask" && "text-sky-600 hover:text-sky-700 dark:text-sky-400",
            value === "accept_edits" && "text-amber-600 hover:text-amber-700 dark:text-amber-400",
            value === "auto" && "text-purple-600 hover:text-purple-700 dark:text-purple-400"
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
