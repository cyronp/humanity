import { useAtomValue } from "@effect/atom-react"
import type { ClaudeModel } from "@humanity/contracts"
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
import { InputGroupButton } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { claudeStatusAtom } from "@/features/claude/atoms"
import { PROVIDERS, type ProviderId, ProviderIcon } from "./ProviderIcon.tsx"

/** Claude Code's own choice. Picking it sends no model, so the session follows Claude Code. */
const DEFAULT = "default"

const FALLBACK_DEFAULT: ClaudeModel = {
  value: DEFAULT,
  displayName: "Default (recommended)",
  description: "The model Claude Code picks for your account",
}

/**
 * Claude Code lists its current models by alias (`opus`, `sonnet`, ...) and
 * older ones by their full, pinned id (`claude-sonnet-5`, ...).
 */
const isLegacy = (model: ClaudeModel) => model.value.startsWith("claude-")

/** The short name for tight spaces: "Default (recommended)" reads "Default". */
const shortName = (model: ClaudeModel) => model.displayName.replace(/\s*\(recommended\)$/i, "")

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
 * The model a new thread runs on. A popover with a rail of providers (and
 * the starred models), a search over every model, and older models behind
 * "Legacy models". `null` means Claude Code's default.
 */
export function ModelPicker({
  value,
  onChange,
}: {
  readonly value: string | null
  readonly onChange: (model: string | null) => void
}) {
  const status = useAtomValue(claudeStatusAtom)
  const reported = AsyncResult.isSuccess(status) ? status.value.models : []
  const models = reported.some((model) => model.value === DEFAULT)
    ? reported
    : [FALLBACK_DEFAULT, ...reported]
  const selected = value ?? DEFAULT
  const current = models.find((model) => model.value === selected)

  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<Section>("claude-code")
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [favorites, toggleFavorite] = useFavoriteModels()

  const searching = search.trim() !== ""
  const legacy = models.filter(isLegacy)
  const rows = searching
    ? models
    : section === "favorites"
      ? models.filter((model) => favorites.includes(model.value))
      : legacyOpen
        ? legacy
        : models.filter((model) => !isLegacy(model))

  const choose = (model: ClaudeModel) => {
    onChange(model.value === DEFAULT ? null : model.value)
    setOpen(false)
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
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
      <PopoverTrigger asChild>
        <InputGroupButton
          size="sm"
          className="max-w-48 text-muted-foreground hover:text-foreground"
          aria-label={`Model: ${current === undefined ? selected : current.displayName}`}
        >
          <ProviderIcon provider="claude-code" className="size-4" />
          <span className="truncate">{current === undefined ? selected : shortName(current)}</span>
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
          {(Object.keys(PROVIDERS) as Array<ProviderId>).map((provider) => (
            <RailButton
              key={provider}
              label={PROVIDERS[provider].name}
              active={section === provider && !searching}
              onClick={() => showSection(provider)}
            >
              <ProviderIcon provider={provider} className="size-4" />
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
                key={model.value}
                model={model}
                selected={model.value === selected}
                favorite={favorites.includes(model.value)}
                shortcut={searching || index >= 9 ? undefined : `${SHORTCUT_PREFIX}${index + 1}`}
                onSelect={() => choose(model)}
                onToggleFavorite={() => toggleFavorite(model.value)}
              />
            ))}
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
  readonly model: ClaudeModel
  readonly selected: boolean
  readonly favorite: boolean
  readonly shortcut: string | undefined
  readonly onSelect: () => void
  readonly onToggleFavorite: () => void
}) {
  const provider = PROVIDERS["claude-code"]
  return (
    <CommandItem
      value={model.value}
      keywords={[model.displayName, model.description, provider.vendor]}
      onSelect={onSelect}
      title={model.description}
      className="gap-3 py-2 [&>svg:last-child]:hidden"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{model.displayName}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ProviderIcon provider="claude-code" className="size-3" />
          {provider.vendor}
        </span>
      </span>
      {selected && <Check className="text-foreground" aria-label="Selected" />}
      {shortcut !== undefined && <Kbd>{shortcut}</Kbd>}
      <button
        type="button"
        aria-label={favorite ? `Unstar ${model.displayName}` : `Star ${model.displayName}`}
        aria-pressed={favorite}
        onClick={(event) => {
          // Starring a model must not also pick it.
          event.stopPropagation()
          onToggleFavorite()
        }}
        className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        <Star className={cn("size-3.5", favorite && "fill-amber-400 text-amber-400")} />
      </button>
    </CommandItem>
  )
}
