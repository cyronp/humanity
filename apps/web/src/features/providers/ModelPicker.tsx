import { useAtomValue } from "@effect/atom-react"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react"
import { type KeyboardEvent, type ReactNode, useState } from "react"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { RowToggle } from "@/components/RowToggle"
import { InputGroupButton } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { claudeStatusAtom } from "@/features/claude/atoms"
import { codexStatusAtom } from "@/features/codex/atoms"
import { kiroStatusAtom } from "@/features/kiro/atoms"
import {
  DEFAULT_MODEL,
  type ModelChoice,
  modelKey,
  offeredProviders,
  type PickerModel,
  pickerModels,
  shortModelName,
} from "./models.ts"
import { PROVIDERS, type ProviderId, ProviderIcon } from "./ProviderIcon.tsx"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
/**
 * Alt (⌥ on macOS) + 1–9 picks a row. Ctrl/⌘ + digit would read better, but
 * browsers keep those for switching tabs and never pass them to the page.
 */
const SHORTCUT_PREFIX = isMac ? "⌥" : "Alt+"

const FAVORITES_KEY = "humanity.favoriteModels"

const readFavorites = (): ReadonlyArray<string> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []
  } catch {
    return []
  }
}

/** Starred models, remembered in this browser only. */
const useFavoriteModels = () => {
  const [favorites, setFavorites] = useState(readFavorites)
  const toggle = (value: string) =>
    setFavorites((current) => {
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      } catch {
        // Storage can be unavailable (private windows); the stars then last until reload.
      }
      return next
    })
  return [favorites, toggle] as const
}

type Section = "favorites" | ProviderId

/**
 * The model a thread runs on, and with it the provider, chosen before the
 * thread starts; in an open thread (`locked`) only the model changes, among
 * those of the thread's provider. A popover with a rail of providers (and the
 * starred models), a search over every model, and older models behind
 * "Legacy models". A `null` model means the provider's default.
 */
export function ModelPicker({
  provider,
  value,
  onChange,
  locked = false,
  disabled = false,
}: {
  readonly provider: ProviderId
  readonly value: string | null
  readonly onChange: (choice: ModelChoice) => void
  /** The thread already runs on `provider`: models of other providers are not offered. */
  readonly locked?: boolean
  readonly disabled?: boolean
}) {
  const claude = useAtomValue(claudeStatusAtom)
  const codex = useAtomValue(codexStatusAtom)
  const kiro = useAtomValue(kiroStatusAtom)
  // Until a provider has answered, nobody is known to be signed in to it.
  const connected: Record<ProviderId, boolean> = {
    "claude-code": AsyncResult.isSuccess(claude) && claude.value.connection._tag === "Connected",
    codex: AsyncResult.isSuccess(codex) && codex.value.connection._tag === "Connected",
    kiro: AsyncResult.isSuccess(kiro) && kiro.value.connection._tag === "Connected",
  }
  const answered: Record<ProviderId, boolean> = {
    "claude-code": AsyncResult.isSuccess(claude),
    codex: AsyncResult.isSuccess(codex),
    kiro: AsyncResult.isSuccess(kiro),
  }
  const providers = offeredProviders(
    Object.keys(PROVIDERS) as Array<ProviderId>,
    provider,
    connected,
    locked,
  )
  const reported: Record<ProviderId, ReadonlyArray<PickerModel>> = {
    "claude-code": pickerModels(
      "claude-code",
      AsyncResult.isSuccess(claude) ? claude.value.models : [],
    ),
    codex: pickerModels("codex", AsyncResult.isSuccess(codex) ? codex.value.models : []),
    kiro: pickerModels("kiro", AsyncResult.isSuccess(kiro) ? kiro.value.models : []),
  }
  const models = providers.flatMap((id) => reported[id])
  const selected = value ?? DEFAULT_MODEL
  const isSelected = (model: PickerModel) => model.provider === provider && model.value === selected
  const current = models.find(isSelected)

  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<Section>(provider)
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [favorites, toggleFavorite] = useFavoriteModels()

  const searching = search.trim() !== ""
  const inSection = section === "favorites" ? [] : reported[section]
  const legacy = inSection.filter((model) => model.legacy)
  const rows = searching
    ? models
    : section === "favorites"
      ? models.filter((model) => favorites.includes(modelKey(model)))
      : legacyOpen
        ? legacy
        : inSection.filter((model) => !model.legacy)

  const choose = (model: PickerModel) => {
    onChange({
      provider: model.provider,
      model: model.value === DEFAULT_MODEL ? null : model.value,
    })
    setOpen(false)
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSection(provider)
    } else {
      setSearch("")
      setLegacyOpen(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const digit = /^Digit([1-9])$/.exec(event.code)?.[1]
    if (!event.altKey || digit === undefined || searching) return
    const model = rows[Number(digit) - 1]
    if (model === undefined) return
    event.preventDefault()
    choose(model)
  }

  const showSection = (next: Section) => {
    setSection(next)
    setLegacyOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        <InputGroupButton
          variant="muted"
          size="sm"
          className="max-w-48"
          aria-label={`Model: ${current === undefined ? selected : current.displayName}`}
        >
          <ProviderIcon provider={provider} className="size-4" />
          <span className="truncate">
            {current === undefined ? selected : shortModelName(current)}
          </span>
        </InputGroupButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] max-w-[calc(100vw-2rem)] flex-row gap-0 p-0">
        <nav
          aria-label="Model providers"
          className="flex shrink-0 flex-col items-center gap-1 border-r p-2"
        >
          <RailButton
            label="Favorites"
            active={section === "favorites" && !searching}
            onClick={() => showSection("favorites")}
          >
            <Star className="size-4" />
          </RailButton>
          {providers.map((id) => (
            <RailButton
              key={id}
              label={PROVIDERS[id].beta ? `${PROVIDERS[id].name} (Beta)` : PROVIDERS[id].name}
              active={section === id && !searching}
              onClick={() => showSection(id)}
            >
              <ProviderIcon provider={id} className="size-4" />
            </RailButton>
          ))}
        </nav>
        <Command
          shouldFilter={searching}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 rounded-none! bg-transparent"
        >
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search models…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No model matches.</CommandEmpty>
            {legacyOpen && !searching && section !== "favorites" && (
              <CommandItem
                value="back"
                onSelect={() => setLegacyOpen(false)}
                className="text-muted-foreground [&>svg:last-child]:hidden"
              >
                <ChevronLeft />
                Legacy models
              </CommandItem>
            )}
            {rows.map((model, index) => (
              <ModelRow
                key={modelKey(model)}
                model={model}
                selected={isSelected(model)}
                favorite={favorites.includes(modelKey(model))}
                shortcut={searching || index >= 9 ? undefined : `${SHORTCUT_PREFIX}${index + 1}`}
                onSelect={() => choose(model)}
                onToggleFavorite={() => toggleFavorite(modelKey(model))}
              />
            ))}
            {/* Only the provider already chosen is shown while nobody is signed in to it. */}
            {section !== "favorites" && !searching && answered[section] && !connected[section] && (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                {PROVIDERS[section].name} is not signed in. Settings, under Providers, shows how.
              </p>
            )}
            {section === "favorites" && !searching && rows.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Star a model to keep it here.
              </p>
            )}
            {section !== "favorites" && !searching && !legacyOpen && legacy.length > 0 && (
              <CommandItem
                value="legacy models"
                onSelect={() => setLegacyOpen(true)}
                className="py-2 [&>svg:last-child]:hidden"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium">Legacy models</span>
                  <span className="text-xs text-muted-foreground">{legacy.length} models</span>
                </span>
                <ChevronRight className="text-muted-foreground" />
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  readonly label: string
  readonly active: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            active &&
              "text-foreground after:absolute after:top-1.5 after:-right-2 after:bottom-1.5 after:w-0.5 after:rounded-full after:bg-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

function ModelRow({
  model,
  selected,
  favorite,
  shortcut,
  onSelect,
  onToggleFavorite,
}: {
  readonly model: PickerModel
  readonly selected: boolean
  readonly favorite: boolean
  readonly shortcut: string | undefined
  readonly onSelect: () => void
  readonly onToggleFavorite: () => void
}) {
  const provider = PROVIDERS[model.provider]
  return (
    <CommandItem
      value={modelKey(model)}
      keywords={[model.displayName, model.description, provider.vendor]}
      onSelect={onSelect}
      title={model.description}
      className="gap-3 py-2 [&>svg:last-child]:hidden"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{model.displayName}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ProviderIcon provider={model.provider} className="size-3" />
          {provider.vendor}
        </span>
      </span>
      {selected && <Check className="text-foreground" aria-label="Selected" />}
      {shortcut !== undefined && <Kbd>{shortcut}</Kbd>}
      <RowToggle
        label={favorite ? `Unstar ${model.displayName}` : `Star ${model.displayName}`}
        pressed={favorite}
        onToggle={onToggleFavorite}
        // The star reads a little stronger than a pin when off.
        className="text-muted-foreground"
      >
        <Star className={cn("size-3.5", favorite && "fill-amber-400 text-amber-400")} />
      </RowToggle>
    </CommandItem>
  )
}
