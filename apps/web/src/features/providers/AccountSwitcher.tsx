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
import { openSettings } from "@/features/settings/settings"
import { describeCause } from "@/lib/errors"
import { configuredProviders } from "./accounts/configured.ts"
import { accountLine } from "./accounts/summary.ts"
import { useAccounts } from "./accounts/useAccounts.ts"
import { PROVIDER_IDS, type ProviderId, PROVIDERS, ProviderIcon } from "./ProviderIcon.tsx"
import { useProviderAccountLists } from "./useProviderModels.ts"

const OPEN_DELAY_MS = 150
const CLOSE_DELAY_MS = 200

function useHoverOpen() {
  const [open, setOpen] = useState(false)
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
    onOpenChange: (next: boolean) => (next ? setOpen(true) : close()),
    close,
    hover: { onPointerEnter, onPointerLeave },
    onClick: (event: MouseEvent) => {
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

function useConfiguredProviders() {
  const listed = useProviderAccountLists()
  return configuredProviders(PROVIDER_IDS.map((provider) => [provider, listed[provider]]))
}

export function AccountSwitcher({ onNavigate }: { readonly onNavigate?: () => void }) {
  const menu = useHoverOpen()
  const { shown, reading } = useConfiguredProviders()

  return (
    <Popover open={menu.open} onOpenChange={menu.onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Accounts"
          onClick={menu.onClick}
          className="gap-2 px-2 text-muted-foreground hover:text-foreground"
          {...menu.hover}
        >
          {shown.length === 0 ? (
            <CircleUserRound />
          ) : (
            <span className="flex items-center -space-x-1">
              {shown.map((provider) => (
                <span key={provider} className="rounded-full bg-sidebar p-0.5">
                  <ProviderIcon provider={provider} className="size-3.5" />
                </span>
              ))}
            </span>
          )}
          Accounts
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 gap-0 p-0"
        onOpenAutoFocus={(event) => {
          if (!menu.pinned) event.preventDefault()
        }}
        {...menu.hover}
      >
        <ScrollArea viewportClassName="max-h-72 scroll-fade-y">
          <div className="flex flex-col gap-2 p-1.5">
            {shown.map((provider) => (
              <ProviderChoices key={provider} provider={provider} />
            ))}
            {shown.length === 0 && (
              <p className="flex items-center gap-2 p-1.5 text-muted-foreground">
                {reading ? (
                  <>
                    <Spinner />
                    Reading the accounts…
                  </>
                ) : (
                  "No provider is signed in yet."
                )}
              </p>
            )}
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

interface Choice {
  readonly id: string
  readonly name: string
  readonly active: boolean
  readonly detail: string
}

function AccountChoices<E>({
  provider,
  result,
  setActive,
}: {
  readonly provider: ProviderId
  readonly result: AsyncResult.AsyncResult<ReadonlyArray<Choice>, E>
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
          <ErrorNote title="Could not load accounts" message={describeCause(failure.cause)} />
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

function ProviderChoices({ provider }: { readonly provider: ProviderId }) {
  const { result, setActive } = useAccounts(provider)
  const choices = AsyncResult.map(result, (accounts) =>
    accounts.map((account): Choice => ({
      ...account,
      detail: accountLine(provider, account.status),
    })),
  )
  return <AccountChoices provider={provider} result={choices} setActive={setActive} />
}
