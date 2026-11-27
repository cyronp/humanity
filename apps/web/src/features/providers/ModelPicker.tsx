import { useAtomValue } from "@effect/atom-react"
import { cn } from "cn"
import { DEFAULT_ACCOUNT, type ReasoningEffort } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { Check, ChevronLeft, ChevronRight, Star, TriangleAlert } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { InlineError } from "@/components/InlineError"
import { PinDefaultButton } from "@/components/PinDefaultButton"
import { RowToggle } from "@/components/RowToggle"
import { InputGroupButton } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePinnedDefaults } from "@/features/home/pinnedDefaults"
import { isMac } from "@/lib/shortcuts"
import { readStoredJson, writeStoredJson } from "@/lib/storage"
import { DEFAULT_EFFORT, effortLabel, effortOptionsFor, effortTone } from "./effort.ts"
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

const SHORTCUT_PREFIX = isMac() ? "⌥" : "Alt+"

const FAVORITES_KEY = "humanity.favoriteModels"

const readFavorites = (): ReadonlyArray<string> => {
  const parsed = readStoredJson(FAVORITES_KEY)
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : []
}

const useFavoriteModels = () => {
  const [favorites, setFavorites] = useState(readFavorites)
  const toggle = (value: string) =>
    setFavorites((current) => {
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      writeStoredJson(FAVORITES_KEY, next)
      return next
    })
  return [favorites, toggle] as const
}

type Section = "favorites" | ProviderId

const sameModel = (choice: ModelChoice, model: Pick<PickerModel, "provider" | "value">) =>
  choice.provider === model.provider && (choice.model ?? DEFAULT_MODEL) === model.value

export interface CompareChoices {
  readonly others: ReadonlyArray<ModelChoice>
  readonly max: number
  readonly onOthersChange: (others: ReadonlyArray<ModelChoice>) => void
}

interface ModelPickerProps {
  readonly provider: ProviderId
  readonly value: string | null
  readonly onChange: (choice: ModelChoice) => void
  readonly effort: ReasoningEffort | null
  readonly onEffortChange: (effort: ReasoningEffort | null) => void
  readonly locked?: boolean
  readonly movesThread?: boolean
  readonly accountId?: string | undefined
  readonly disabled?: boolean
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly compare?: CompareChoices | undefined
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
  effort,
  onEffortChange,
  locked = false,
  movesThread = false,
  accountId = DEFAULT_ACCOUNT,
  disabled = false,
  open: openFromOutside,
  onOpenChange: tellOpen,
  compare,
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
  const [highlighted, setHighlighted] = useState("")
  const [favorites, toggleFavorite] = useFavoriteModels()
  const [effortOpen, setEffortOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

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

  const others = compare?.others ?? []
  const isOther = (model: PickerModel) => others.some((choice) => sameModel(choice, model))
  const additive = useRef(false)

  const choiceOf = (model: PickerModel): ModelChoice => ({
    provider: model.provider,
    model: model.value === DEFAULT_MODEL ? null : model.value,
    ...(accounts === undefined ? {} : { accountId: accountFor(model.provider) }),
  })

  const toggle = (compared: CompareChoices, model: PickerModel) => {
    if (isSelected(model)) {
      const [next, ...rest] = others
      if (next === undefined) return
      onChange(next)
      compared.onOthersChange(rest)
      return
    }
    if (isOther(model)) {
      compared.onOthersChange(others.filter((choice) => !sameModel(choice, model)))
      return
    }
    if (others.length + 1 >= compared.max) return
    compared.onOthersChange([...others, choiceOf(model)])
  }

  const choose = (model: PickerModel, add = false) => {
    if (add && compare !== undefined) {
      toggle(compare, model)
      return
    }
    onChange(choiceOf(model))
    if (others.length > 0) compare?.onOthersChange([])
    if (!effortOpen) setOpen(false)
  }

  const pickEffort = (next: ReasoningEffort | null) => {
    onEffortChange(next)
    setEffortOpen(false)
    setOpen(false)
  }

  const nameOf = (choice: ModelChoice) => {
    const found = modelsOf(choice.provider).find((model) => sameModel(choice, model))
    return found === undefined ? (choice.model ?? DEFAULT_MODEL) : shortModelName(found)
  }
  const currentName = current === undefined ? selected : shortModelName(current)
  const runs: ReadonlyArray<StackedModel> = [
    { provider, name: currentName },
    ...others.map((choice) => ({ provider: choice.provider, name: nameOf(choice) })),
  ]
  const allNames = runs.map((run) => run.name).join(", ")
  const [tipOpen, setTipOpen] = useState(false)

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSection(provider)
      setChosenAccounts({})
      setHighlighted(current === undefined ? "" : modelKey(current))
    } else {
      setSearch("")
      setLegacyOpen(false)
      setEffortOpen(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    additive.current = event.shiftKey
    const digit = /^Digit([1-9])$/.exec(event.code)?.[1]
    if (!event.altKey || digit === undefined || searching) return
    const model = rows[Number(digit) - 1]
    if (model === undefined) return
    event.preventDefault()
    choose(model, event.shiftKey)
  }

  const showSection = (next: Section) => {
    setSection(next)
    setLegacyOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip open={tipOpen && others.length > 0 && !open} onOpenChange={setTipOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <TooltipTrigger asChild>
            <InputGroupButton
              variant="muted"
              size="sm"
              className="max-w-64 min-w-0"
              aria-label={`${
                others.length === 0
                  ? `Model: ${current === undefined ? selected : current.displayName}`
                  : `Models: ${allNames}`
              }, reasoning: ${effortLabel(effort)}`}
            >
              {others.length === 0 ? (
                <ProviderIcon provider={provider} className="size-4" />
              ) : (
                <ModelStack runs={runs} />
              )}
              <span className="truncate">{others.length === 0 ? currentName : "Multiple"}</span>
              {effort !== null && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {effortLabel(effort)}
                </span>
              )}
            </InputGroupButton>
          </TooltipTrigger>
        </PopoverTrigger>
        <TooltipContent side="top" align="end" className="flex flex-col items-start gap-1.5 py-2">
          <span className="text-muted-foreground">Runs on {runs.length} models</span>
          {runs.map((run, index) => (
            <span key={index} className="flex items-center gap-1.5">
              <ProviderIcon provider={run.provider} className="size-3.5" />
              {run.name}
            </span>
          ))}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        ref={pickerRef}
        side="top"
        align="end"
        avoidCollisions={false}
        collisionPadding={8}
        className="w-120 max-w-[min(calc(100vw-1rem),var(--radix-popover-content-available-width))] gap-0 p-0"
      >
        <ProviderTabs
          active={searching ? undefined : section}
          label={
            searching
              ? undefined
              : section === "favorites"
                ? "Favorites"
                : PROVIDERS[section].beta
                  ? `${PROVIDERS[section].name} (Beta)`
                  : PROVIDERS[section].name
          }
        >
          <ProviderTab
            id="favorites"
            label="Favorites"
            active={section === "favorites" && !searching}
            onClick={() => showSection("favorites")}
          >
            <Star className="size-4" />
          </ProviderTab>
          {providers.map((id) => (
            <ProviderTab
              key={id}
              id={id}
              label={PROVIDERS[id].beta ? `${PROVIDERS[id].name} (Beta)` : PROVIDERS[id].name}
              active={section === id && !searching}
              onClick={() => showSection(id)}
            >
              <ProviderIcon provider={id} className="size-4" />
            </ProviderTab>
          ))}
        </ProviderTabs>
        <Command
          value={highlighted}
          onValueChange={setHighlighted}
          shouldFilter={searching}
          onKeyDown={onKeyDown}
          onPointerDownCapture={(event) => {
            additive.current = event.shiftKey
          }}
          className="min-w-0 rounded-none! bg-transparent"
        >
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search models…" />
          <CommandList
            className={cn(
              "max-h-none pt-2",
              compare === undefined
                ? "h-[min(16rem,calc(var(--radix-popover-content-available-height)-8.5rem))]"
                : "h-[min(16rem,calc(var(--radix-popover-content-available-height)-11rem))]",
            )}
          >
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
                selected={isSelected(model) || isOther(model)}
                favorite={favorites.includes(modelKey(model))}
                shortcut={searching || index >= 9 ? undefined : `${SHORTCUT_PREFIX}${index + 1}`}
                onSelect={() => choose(model, additive.current)}
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
          {compare !== undefined && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
              {others.length === 0
                ? "Shift+click to run this prompt on several models and compare them."
                : `${others.length + 1} models, each in a worktree of its own. Shift+click adds or removes one, up to ${compare.max}.`}
            </p>
          )}
        </Command>
        <ReasoningMenu
          model={current}
          effort={effort}
          open={effortOpen}
          onOpenChange={setEffortOpen}
          onPick={pickEffort}
          picker={pickerRef}
        />
      </PopoverContent>
    </Popover>
  )
}

interface StackedModel {
  readonly provider: ProviderId
  readonly name: string
}

const STACK_CUTOUT = "radial-gradient(circle 10px at 20px 50%, transparent 99%, #000 100%)"

function ModelStack({ runs }: { readonly runs: ReadonlyArray<StackedModel> }) {
  const shown = runs.length > 2 ? runs.slice(0, 1) : runs
  const items = shown.length + (runs.length > 2 ? 1 : 0)
  const cutout = (index: number) =>
    index < items - 1 ? { maskImage: STACK_CUTOUT, WebkitMaskImage: STACK_CUTOUT } : undefined
  return (
    <span aria-hidden className="flex shrink-0 items-center -space-x-1">
      {shown.map((run, index) => (
        <span key={index} className="flex size-4 shrink-0" style={cutout(index)}>
          <ProviderIcon provider={run.provider} className="size-4" />
        </span>
      ))}
      {runs.length > 2 && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[0.6rem] leading-none font-medium text-muted-foreground tabular-nums">
          +{runs.length - 1}
        </span>
      )}
    </span>
  )
}

function ReasoningMenu({
  model,
  effort,
  open,
  onOpenChange,
  onPick,
  picker,
}: {
  readonly model: PickerModel | undefined
  readonly effort: ReasoningEffort | null
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onPick: (effort: ReasoningEffort | null) => void
  readonly picker: RefObject<HTMLDivElement | null>
}) {
  const pins = usePinnedDefaults()
  const options = effortOptionsFor(model?.efforts)
  const selected = effort ?? DEFAULT_EFFORT
  const offered = options.some((option) => option.value === selected)
  const none = model?.efforts?.length === 0
  const list = useRef<HTMLDivElement>(null)
  const radios = () =>
    Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])

  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      onOpenChange(false)
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const all = radios()
    const at = all.findIndex((radio) => radio === document.activeElement)
    if (at === -1) return
    event.preventDefault()
    all[(at + (event.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus()
  }

  return (
    <Popover open={open && !none} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild disabled={none}>
        <button
          type="button"
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" || none) return
            event.preventDefault()
            onOpenChange(true)
          }}
          className="flex h-10 w-full shrink-0 items-center justify-between gap-3 border-t px-3 text-sm outline-none hover:bg-muted focus-visible:bg-muted aria-expanded:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
        >
          <span>Reasoning</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {none ? (
              "Not offered"
            ) : (
              <span className={effortTone(effort)}>{effortLabel(effort)}</span>
            )}
            <ChevronRight className="size-3.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={6}
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-56 max-w-(--radix-popover-content-available-width) gap-0 overflow-y-auto p-1.5 text-xs"
        onKeyDown={onMenuKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const all = radios()
          ;(all.find((radio) => radio.getAttribute("aria-checked") === "true") ?? all[0])?.focus()
        }}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && picker.current?.contains(event.target)) {
            event.preventDefault()
          }
        }}
      >
        <p className="px-2 pt-1 pb-1.5 text-muted-foreground">
          {model === undefined ? "Reasoning" : `Reasoning for ${shortModelName(model)}`}
        </p>
        <div
          ref={list}
          role="radiogroup"
          aria-label="Reasoning effort"
          className="flex flex-col gap-0.5"
        >
          {options.map((option) => (
            <div
              key={option.value}
              className="group/effort flex items-center gap-1 rounded-md hover:bg-muted"
            >
              <button
                type="button"
                role="radio"
                aria-checked={option.value === selected}
                onClick={() => onPick(option.value === DEFAULT_EFFORT ? null : option.value)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-sm",
                      effortTone(option.value === DEFAULT_EFFORT ? null : option.value),
                    )}
                  >
                    {option.label}
                  </span>
                  {option.description !== undefined && option.value !== "max" && (
                    <span className="text-muted-foreground">{option.description}</span>
                  )}
                </span>
                <Check
                  className={cn("size-3.5 shrink-0", option.value !== selected && "invisible")}
                />
              </button>
              <PinDefaultButton
                label={option.label}
                pinned={pins.pinned.effort === option.value}
                disabled={!pins.ready}
                onToggle={() => void pins.toggle("effort", option.value)}
                className="opacity-0 group-hover/effort:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100 pointer-coarse:opacity-100"
              />
            </div>
          ))}
        </div>
        {!offered && (
          <p className="px-2 py-1 text-muted-foreground">
            {effortLabel(effort)} is not one of this model&apos;s levels.
          </p>
        )}
        {pins.error !== undefined && (
          <InlineError className="px-2 py-1">The default was not changed: {pins.error}</InlineError>
        )}
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

const TAB_INSET = 8

function ProviderTabs({
  active,
  label,
  children,
}: {
  readonly active: Section | undefined
  readonly label: string | undefined
  readonly children: ReactNode
}) {
  const nav = useRef<HTMLElement>(null)
  const line = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const root = nav.current
    const bar = line.current
    if (root === null || bar === null) return
    const tab =
      active === undefined ? null : root.querySelector<HTMLElement>(`[data-tab="${active}"]`)
    if (tab === null) {
      bar.style.opacity = "0"
      return
    }
    bar.style.transform = `translateX(${tab.offsetLeft + TAB_INSET}px)`
    bar.style.width = `${tab.offsetWidth - TAB_INSET * 2}px`
    bar.style.opacity = "1"
    if (bar.dataset.placed === undefined) {
      requestAnimationFrame(() => {
        bar.dataset.placed = ""
      })
    }
  }, [active])

  return (
    <nav
      ref={nav}
      aria-label="Model providers"
      className="relative flex shrink-0 items-center gap-0.5 border-b px-1.5"
    >
      {children}
      {label !== undefined && (
        <span
          key={label}
          aria-hidden
          className="ml-auto min-w-0 truncate pr-1.5 pl-3 text-xs text-muted-foreground duration-200 animate-in fade-in-0 motion-reduce:animate-none"
        >
          {label}
        </span>
      )}
      <span
        ref={line}
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-0 rounded-full bg-foreground opacity-0 duration-200 ease-out motion-reduce:transition-none data-placed:transition-[transform,opacity]"
      />
    </nav>
  )
}

function ProviderTab({
  id,
  label,
  active,
  onClick,
  children,
}: {
  readonly id: Section
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
          data-tab={id}
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none",
            active && "text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
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
      className="gap-3 py-2 select-none [&>svg:last-child]:hidden"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{model.displayName}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ProviderIcon provider={model.provider} className="size-3" />
          {provider.vendor}
        </span>
      </span>
      {selected && <Check className="text-foreground" aria-label="Selected" />}
      {shortcut !== undefined && <Kbd className="pointer-coarse:hidden">{shortcut}</Kbd>}
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
