import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { Check, CircleUserRound, Settings } from "lucide-react"
import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { accountLine } from "@/features/claude/summary"
import { useClaudeAccounts } from "@/features/claude/useClaudeAccounts"
import { codexLine } from "@/features/codex/summary"
import { useCodexAccounts } from "@/features/codex/useCodexAccounts"
import { openSettings } from "@/features/settings/settings"
import { describeCause } from "@/lib/errors"
import { type ProviderId, PROVIDERS } from "./ProviderIcon.tsx"

/** How long the pointer rests on the icon before the menu opens, and may leave before it closes. */
const OPEN_DELAY_MS = 150
const CLOSE_DELAY_MS = 200

/**
 * Opens on hover and closes once the pointer has left both the icon and the
 * menu. A click keeps it open until the human clicks away; touch has only the click.
 */
function useHoverOpen() {
  const [open, setOpen] = useState(false)
  // Opened by a click (or the keyboard): hovering away leaves it open.
  const [pinned, setPinned] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const clear = () => clearTimeout(timer.current)
  useEffect(() => clear, [])

  const close = () => {
    clear()
    setOpen(false)
    setPinned(false)
  }
  const later = (action: () => void, ms: number) => {
    clear()
    timer.current = setTimeout(action, ms)
  }
  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    if (open) clear()
    else later(() => setOpen(true), OPEN_DELAY_MS)
  }
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    if (!open) clear()
    else if (!pinned) later(close, CLOSE_DELAY_MS)
  }

  return {
    open,
    pinned,
    /** Escape, a click outside, or a choice in the menu. */
    onOpenChange: (next: boolean) => (next ? setOpen(true) : close()),
    close,
    hover: { onPointerEnter, onPointerLeave },
    onClick: (event: MouseEvent) => {
      // The toggle is decided here: a click on a menu opened by hover keeps it open.
      event.preventDefault()
      clear()
      if (open && pinned) {
        close()
      } else {
        setOpen(true)
        setPinned(true)
      }
    },
  }
}

/**
 * The accounts threads run as, as one icon in the sidebar. Hovering or
 * pressing it lists them provider by provider, and picks the one new threads
 * of a provider run as where it has more than one.
 */
export function AccountSwitcher({ onNavigate }: { readonly onNavigate?: () => void }) {
  const menu = useHoverOpen()

  return (
    <Popover open={menu.open} onOpenChange={menu.onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Accounts"
          onClick={menu.onClick}
          {...menu.hover}
        >
          <CircleUserRound />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 gap-0 p-0"
        // Opened by hover, focus stays where it was; opened by a click, it moves into the menu.
        onOpenAutoFocus={(event) => {
          if (!menu.pinned) event.preventDefault()
        }}
        {...menu.hover}
      >
        {/* The list scrolls inside the menu, fading at whichever edge has more past it. */}
        <ScrollArea viewportClassName="max-h-72 scroll-fade-y">
          <div className="flex flex-col gap-2 p-1.5">
            <ClaudeAccounts />
            <CodexAccounts />
          </div>
        </ScrollArea>
        <div className="border-t p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => {
              menu.close()
              onNavigate?.()
              openSettings("providers")
            }}
          >
            <Settings />
            Manage accounts
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** One provider's accounts, under its icon and name. */
function ProviderGroup({
  provider,
  children,
}: {
  readonly provider: ProviderId
  readonly children: ReactNode
}) {
  const { name, Icon } = PROVIDERS[provider]
  const headingId = `accounts-${provider}`
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-0.5">
      <h3
        id={headingId}
        className="flex items-center gap-1.5 px-1.5 pt-1 pb-0.5 text-xs font-medium text-muted-foreground"
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {name}
      </h3>
      {children}
    </section>
  )
}

/** What the menu shows of an account, whatever its provider. */
interface Choice {
  readonly id: string
  readonly name: string
  readonly active: boolean
  /** One line about its login: the plan, or what is wrong. */
  readonly detail: string
}

/**
 * A provider's accounts, the active one checked; picking another makes new
 * threads of that provider run as it.
 */
function AccountChoices<E>({
  provider,
  result,
  setActive,
}: {
  readonly provider: ProviderId
  readonly result: AsyncResult.AsyncResult<ReadonlyArray<Choice>, E>
  /** Resolves to an error message, or `undefined` when it worked. */
  readonly setActive: (accountId: string) => Promise<string | undefined>
}) {
  const [error, setError] = useState<string>()
  const [switching, setSwitching] = useState<string>()

  const use = async (account: Choice) => {
    if (account.active) return
    setSwitching(account.id)
    setError(await setActive(account.id))
    setSwitching(undefined)
  }

  return (
    <ProviderGroup provider={provider}>
      {AsyncResult.match(result, {
        onInitial: () => (
          <p className="flex items-center gap-2 p-1.5 text-muted-foreground">
            <Spinner />
            Reading the accounts…
          </p>
        ),
        onFailure: (failure) => (
          <ErrorNote
            title="Could not ask the daemon about the accounts"
            message={describeCause(failure.cause)}
          />
        ),
        onSuccess: ({ value }) => (
          <div
            role="radiogroup"
            aria-label={`${PROVIDERS[provider].name} account for new threads`}
            className="flex flex-col gap-0.5"
          >
            {value.map((account) => (
              <button
                key={account.id}
                type="button"
                role="radio"
                aria-checked={account.active}
                disabled={switching !== undefined}
                onClick={() => void use(account)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-60",
                  account.active && "bg-muted/60",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{account.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{account.detail}</span>
                </span>
                {switching === account.id ? (
                  <Spinner className="size-4 shrink-0" />
                ) : (
                  <Check
                    aria-hidden
                    className={cn("size-4 shrink-0", account.active ? "opacity-100" : "opacity-0")}
                  />
                )}
              </button>
            ))}
          </div>
        ),
      })}
      {error !== undefined && <ErrorNote title="Could not switch accounts" message={error} />}
    </ProviderGroup>
  )
}

function ClaudeAccounts() {
  const { result, setActive } = useClaudeAccounts()
  const choices = AsyncResult.map(result, (accounts) =>
    accounts.map((account): Choice => ({ ...account, detail: accountLine(account.status) })),
  )
  return <AccountChoices provider="claude-code" result={choices} setActive={setActive} />
}

function CodexAccounts() {
  const { result, setActive } = useCodexAccounts()
  const choices = AsyncResult.map(result, (accounts) =>
    accounts.map((account): Choice => ({ ...account, detail: codexLine(account.status) })),
  )
  return <AccountChoices provider="codex" result={choices} setActive={setActive} />
}
