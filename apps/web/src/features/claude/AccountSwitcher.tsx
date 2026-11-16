import { useAtomValue } from "@effect/atom-react"
import type { ClaudeAccount } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { Check, Settings, UserPlus } from "lucide-react"
import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { openSettings } from "@/features/settings/settings"
import { describeCause } from "@/lib/errors"
import { claudeStatusAtom } from "./atoms.ts"
import { ClaudeMark } from "./ClaudeMark.tsx"
import { accountLine, connectionFacts, summarizeClaude } from "./summary.ts"
import { useClaudeAccounts } from "./useClaudeAccounts.ts"

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
 * The account new threads run as, as one icon in the sidebar. Hovering or
 * pressing it lists the accounts to pick from, or, with only one, which plan
 * it is on.
 */
export function AccountSwitcher({ onNavigate }: { readonly onNavigate?: () => void }) {
  const menu = useHoverOpen()
  const status = useAtomValue(claudeStatusAtom)

  const label = AsyncResult.match(status, {
    onInitial: () => "Checking the account…",
    onFailure: () => "Could not ask the daemon about the accounts",
    onSuccess: ({ value }) => `Account: ${accountLine(value)}`,
  })

  return (
    <Popover open={menu.open} onOpenChange={menu.onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={menu.onClick}
          {...menu.hover}
        >
          <ClaudeMark className="size-4.5" />
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
        <AccountPanel
          onManage={() => {
            menu.close()
            onNavigate?.()
            openSettings("providers")
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Asks for every account only once the popover is open: the icon itself needs just the active one. */
function AccountPanel({ onManage }: { readonly onManage: () => void }) {
  const { result, setActive } = useClaudeAccounts()
  const [error, setError] = useState<string>()
  const [switching, setSwitching] = useState<string>()

  const use = async (accountId: string) => {
    setSwitching(accountId)
    setError(await setActive(accountId))
    setSwitching(undefined)
  }

  const single = AsyncResult.isSuccess(result) && result.value.length === 1

  return (
    <>
      {AsyncResult.match(result, {
        onInitial: () => (
          <p className="flex items-center gap-2 p-3 text-muted-foreground">
            <Spinner />
            Reading the accounts…
          </p>
        ),
        onFailure: (failure) => (
          <div className="p-3">
            <ErrorNote
              title="Could not ask the daemon about the accounts"
              message={describeCause(failure.cause)}
            />
          </div>
        ),
        onSuccess: ({ value }) =>
          value.length === 1 && value[0] !== undefined ? (
            <OnlyAccount account={value[0]} />
          ) : (
            <AccountList accounts={value} switching={switching} onUse={(id) => void use(id)} />
          ),
      })}
      {error !== undefined && (
        <div className="px-3 pb-3">
          <ErrorNote title="Could not switch accounts" message={error} />
        </div>
      )}
      <div className="border-t p-1.5">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onManage}>
          {single ? <UserPlus /> : <Settings />}
          {single ? "Add another account" : "Manage accounts"}
        </Button>
      </div>
    </>
  )
}

/** Every account, the active one checked; picking another makes new threads run as it. */
function AccountList({
  accounts,
  switching,
  onUse,
}: {
  readonly accounts: ReadonlyArray<ClaudeAccount>
  readonly switching: string | undefined
  readonly onUse: (accountId: string) => void
}) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      <span className="px-1.5 pt-1 pb-1 text-xs text-muted-foreground">New threads run as</span>
      <div role="radiogroup" aria-label="Account for new threads" className="flex flex-col gap-0.5">
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            role="radio"
            aria-checked={account.active}
            disabled={switching !== undefined}
            onClick={() => {
              if (!account.active) onUse(account.id)
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-md p-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-60",
              account.active && "bg-muted/60",
            )}
          >
            <ClaudeMark className="size-6 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{account.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {summarizeClaude(account.status).short}
              </span>
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
    </div>
  )
}

/** The one account there is, and the plan or credential it runs on. */
function OnlyAccount({ account }: { readonly account: ClaudeAccount }) {
  // Only the plan: who it is signed in as is left to Settings.
  const facts = connectionFacts(account.status).slice(0, 1)
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2.5">
        <ClaudeMark className="size-8 shrink-0" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{account.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {summarizeClaude(account.status).title}
          </span>
        </div>
      </div>
      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {facts.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
