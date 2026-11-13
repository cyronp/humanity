import type { ReasoningEffort } from "@humanity/contracts"
import { cn } from "cn"
import { Brain } from "lucide-react"
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

/** The model's own choice. Picking it sends no effort, so the session follows the model. */
const DEFAULT = "default"

interface EffortOption {
  readonly value: ReasoningEffort | typeof DEFAULT
  readonly label: string
  readonly description: string
}

/** From the least to the most thinking, after the model's default. */
export const EFFORT_OPTIONS: ReadonlyArray<EffortOption> = [
  { value: DEFAULT, label: "Default", description: "The effort the model picks on its own." },
  { value: "low", label: "Low", description: "Fastest. For small, well-defined tasks." },
  { value: "medium", label: "Medium", description: "Balanced speed and depth." },
  { value: "high", label: "High", description: "Thinks longer on harder problems." },
  { value: "xhigh", label: "Extra high", description: "Deeper still, slower and costlier." },
  {
    value: "max",
    label: "Max",
    description: "As much as the model allows. Runs as High where Max is not supported.",
  },
]

/**
 * How hard the model reasons in a thread, chosen before it starts or changed
 * while it is open. `null` means the model's default. The pin on an option
 * makes it the effort every new thread starts with.
 */
export function ReasoningPicker({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: ReasoningEffort | null
  readonly onChange: (effort: ReasoningEffort | null) => void
  readonly disabled?: boolean
}) {
  const pins = usePinnedDefaults()
  const selected = value ?? DEFAULT
  const current = EFFORT_OPTIONS.find((option) => option.value === selected)
  const label = current?.label ?? selected
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <InputGroupButton
          size="sm"
          className={cn(
            "text-muted-foreground hover:text-foreground",
            value === "high" && "text-blue-600 hover:text-blue-700 dark:text-blue-400",
            value === "xhigh" && "text-fuchsia-500 hover:text-fuchsia-600 dark:text-fuchsia-400",
            value === "max" && "text-purple-600 hover:text-purple-700 dark:text-purple-400",
          )}
          aria-label={`Reasoning: ${label}`}
        >
          <Brain />
          <span className="text-xs">{label}</span>
        </InputGroupButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuRadioGroup
          value={selected}
          onValueChange={(next) => {
            const option = EFFORT_OPTIONS.find((candidate) => candidate.value === next)
            if (option !== undefined) onChange(option.value === DEFAULT ? null : option.value)
          }}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
            {EFFORT_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <span className="flex flex-1 flex-col gap-0.5">
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </span>
                <PinDefaultButton
                  label={option.label}
                  pinned={pins.pinned.effort === option.value}
                  disabled={!pins.ready}
                  onToggle={() => void pins.toggle("effort", option.value)}
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
