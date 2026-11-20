import { useAtomValue } from "@effect/atom-react"
import { cn } from "cn"
import { DEFAULT_ACCOUNT } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { Check, ChevronLeft, ChevronRight, Star, TriangleAlert } from "lucide-react"
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
import {
  DEFAULT_MODEL,
  type ModelChoice,
  modelKey,
  offeredProviders,
  type PickerModel,
  shortModelName,
} from "./models.ts"
import { agentCliAtom, cliProblem } from "./cli.ts"
import { type PickerAccount, useProviderAccounts, useProviderModels } from "./useProviderModels.ts"
import { PROVIDERS, type ProviderId, ProviderIcon } from "./ProviderIcon.tsx"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
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

const useFavoriteModels = () => {
  const [favorites, setFavorites] = useState(readFavorites)
  const toggle = (value: string) =>
    setFavorites((current) => {
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  return [favorites, toggle] as const
}

type Section = "favorites" | ProviderId

interface ModelPickerProps {
  readonly provider: ProviderId
  readonly value: string | null
  readonly onChange: (choice: ModelChoice) => void
  /** Offers only the current provider's models. */
  readonly locked?: boolean
  /**
   * The picker of an open thread: picking another provider's model, or another account's, moves
   * the thread there, and the picker says so.
   */
  readonly movesThread?: boolean
  /** The account the thread runs as (`default` for the default login). */
  readonly accountId?: string | undefined
  readonly disabled?: boolean
  /** Opens and closes the picker from outside, when given. */
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
}

export function ModelPicker(props: ModelPickerProps) {
  return props.movesThread === true ? (
    <ThreadModelPicker {...props} />
  ) : (
    <PickerBody {...props} accounts={undefined} />
  )
}

function ThreadModelPicker(props: ModelPickerProps) {
  const accounts = useProviderAccounts()
  return <PickerBody {...props} accounts={accounts} />
}

function PickerBody({
  provider,
  value,
  onChange,
  locked = false,
  movesThread = false,
  accountId = DEFAULT_ACCOUNT,
  disabled = false,
  open: openFromOutside,
  onOpenChange: tellOpen,
  accounts,
}: ModelPickerProps & {
  readonly accounts: Readonly<Record<ProviderId, ReadonlyArray<PickerAccount>>> | undefined
}) {
  const { models: reported, connected, answered } = useProviderModels()
  const providers = offeredProviders(
    Object.keys(PROVIDERS) as Array<ProviderId>,
    provider,
    connected,
    locked,
  )
  const [chosenAccounts, setChosenAccounts] = useState<Partial<Record<ProviderId, string>>>({})
  const signedInAccounts = (id: ProviderId) =>
    (accounts?.[id] ?? []).filter((account) => account.connected)
  const accountFor = (id: ProviderId) =>
    chosenAccounts[id] ??
    (id === provider
      ? accountId
      : (signedInAccounts(id).find((account) => account.active)?.id ?? DEFAULT_ACCOUNT))
  const modelsOf = (id: ProviderId): ReadonlyArray<PickerModel> =>
    signedInAccounts(id).find((account) => account.id === accountFor(id))?.models ?? reported[id]
  const models = providers.flatMap((id) => modelsOf(id))
  const selected = value ?? DEFAULT_MODEL
  const isSelected = (model: PickerModel) =>
    model.provider === provider &&
    model.value === selected &&
    (accounts === undefined || accountFor(provider) === accountId)
  const current = modelsOf(provider).find(
    (model) => model.provider === provider && model.value === selected,
  )

  const [openInside, setOpenInside] = useState(false)
  const open = openFromOutside ?? openInside
  const setOpen = (next: boolean) => {
    setOpenInside(next)
    tellOpen?.(next)
  }
  const [section, setSection] = useState<Section>(provider)
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [favorites, toggleFavorite] = useFavoriteModels()

  const searching = search.trim() !== ""
  const inSection = section === "favorites" ? [] : modelsOf(section)
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
      ...(accounts === undefined ? {} : { accountId: accountFor(model.provider) }),
    })
    setOpen(false)
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSection(provider)
      setChosenAccounts({})
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
      <PopoverContent
        side="top"
        align="end"
        avoidCollisions={false}
        className="w-[26rem] max-w-[calc(100vw-2rem)] flex-row gap-0 p-0"
      >
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
          <CommandList className="h-[min(20rem,calc(var(--radix-popover-content-available-height)-3.5rem))] max-h-none">
            <CommandEmpty>No model matches.</CommandEmpty>
            {section !== "favorites" &&
              !searching &&
              !locked &&
              signedInAccounts(section).length > 1 && (
                <AccountChooser
                  accounts={signedInAccounts(section)}
                  value={accountFor(section)}
                  current={section === provider ? accountId : undefined}
                  onChange={(id) => setChosenAccounts((chosen) => ({ ...chosen, [section]: id }))}
                />
              )}
            {movesThread &&
              section !== "favorites" &&
              !searching &&
              (section !== provider || accountFor(section) !== accountId) && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Picking a model here moves this thread to{" "}
                  {section === provider ? "this account" : PROVIDERS[section].name}. It gets this
                  conversation as context with your next message.
                </p>
              )}
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
            {section !== "favorites" && !searching && <CliPickerNote provider={section} />}
            {movesThread && locked && section === provider && !searching && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Other providers show here once the agent is idle.
              </p>
            )}
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

function AccountChooser({
  accounts,
  value,
  current,
  onChange,
}: {
  readonly accounts: ReadonlyArray<PickerAccount>
  readonly value: string
  /** The account the thread runs as, when this is its provider. */
  readonly current: string | undefined
  readonly onChange: (accountId: string) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Account"
      className="flex flex-wrap items-center gap-1 px-2 py-2"
    >
      <span className="px-1 text-xs text-muted-foreground">Account</span>
      {accounts.map((account) => (
        <button
          key={account.id}
          type="button"
          role="radio"
          aria-checked={account.id === value}
          onClick={() => onChange(account.id)}
          title={account.id === current ? `${account.name} (this thread's account)` : account.name}
          className={cn(
            "max-w-32 truncate rounded-md border px-2 py-0.5 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
            account.id === value
              ? "border-foreground/30 bg-muted font-medium text-foreground"
              : "border-transparent text-muted-foreground",
          )}
        >
          {account.name}
        </button>
      ))}
    </div>
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
        className="text-muted-foreground"
      >
        <Star className={cn("size-3.5", favorite && "fill-amber-400 text-amber-400")} />
      </RowToggle>
    </CommandItem>
  )
}

function CliPickerNote({ provider }: { readonly provider: ProviderId }) {
  const result = useAtomValue(agentCliAtom(provider))
  const problem = AsyncResult.isSuccess(result) ? cliProblem(result.value) : undefined
  if (problem === undefined) return null
  return (
    <p className="flex gap-2 px-3 py-2 text-xs text-warning">
      <TriangleAlert className="mt-px size-3.5 shrink-0" />
      <span>
        {problem} Settings, under Providers, has the{" "}
        {AsyncResult.isSuccess(result) && result.value.path === null
          ? "install link"
          : "Update button"}
        .
      </span>
    </p>
  )
}
