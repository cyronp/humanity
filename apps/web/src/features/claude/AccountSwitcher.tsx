import { useAtomValue } from "@effect/atom-react"
import type { ClaudeAccount } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { LoaderCircle, Settings } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { openSettings } from "@/features/settings/settings"
import { describeCause } from "@/lib/errors"
import { claudeStatusAtom } from "./atoms.ts"
import { ClaudeMark } from "./ClaudeMark.tsx"
import { accountLine, connectionFacts, summarizeClaude } from "./summary.ts"
import { ToneDot } from "./ToneDot.tsx"
import { useClaudeAccounts } from "./useClaudeAccounts.ts"

/**
 * The account new threads run as, as one icon in the sidebar. Its light says
 * whether the account is ready; pressing it shows who that account is and the
 * other accounts to switch to.
 */
export function AccountSwitcher({ onNavigate }: { readonly onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  const status = useAtomValue(claudeStatusAtom)

  const view = AsyncResult.match(status, {
    onInitial: () => ({ tone: "pending" as const, label: "Checking the account…" }),
    onFailure: () => ({
      tone: "error" as const,
      label: "Could not ask the daemon about the accounts",
    }),
    onSuccess: ({ value }) => ({
      tone: summarizeClaude(value).tone,
      label: `Account: ${accountLine(value)}`,
    }),
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={view.label}>
              <ClaudeMark className="size-4.5" />
              <ToneDot tone={view.tone} className="absolute right-1 bottom-1 ring-2 ring-sidebar" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{view.label}</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" className="w-80 gap-0 p-0">
        <AccountPanel
          onManage={() => {
            setOpen(false)
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
  const [switching, setSwitching] = useState(false)

  const use = async (accountId: string) => {
    setSwitching(true)
    setError(await setActive(accountId))
    setSwitching(false)
  }

  return (
    <>
      {AsyncResult.match(result, {
        onInitial: () => (
          <p className="flex items-center gap-2 p-3 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
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
        onSuccess: ({ value }) => (
          <Accounts accounts={value} disabled={switching} onUse={(id) => void use(id)} />
        ),
      })}
      {error !== undefined && (
        <div className="px-3 pb-3">
          <ErrorNote title="Could not switch accounts" message={error} />
        </div>
      )}
      <div className="border-t p-1.5">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onManage}>
          <Settings />
          Manage accounts
        </Button>
      </div>
    </>
  )
}

function Accounts({
  accounts,
  disabled,
  onUse,
}: {
  readonly accounts: ReadonlyArray<ClaudeAccount>
  readonly disabled: boolean
  readonly onUse: (accountId: string) => void
}) {
  const current = accounts.find((account) => account.active)
  const others = accounts.filter((account) => !account.active)
  return (
    <>
      {current !== undefined && <CurrentAccount account={current} />}
      {others.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t p-1.5">
          <SectionLabel className="px-1.5 pt-1.5 pb-1">Switch to</SectionLabel>
          {others.map((account) => (
            <button
              key={account.id}
              type="button"
              disabled={disabled}
              onClick={() => onUse(account.id)}
              aria-label={`Use “${account.name}” for new threads. ${accountLine(account.status)}`}
              className="flex items-center gap-2.5 rounded-md p-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50"
            >
              <AccountMark account={account} className="size-6" />
              <AccountText account={account} />
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function CurrentAccount({ account }: { readonly account: ClaudeAccount }) {
  const facts = connectionFacts(account.status)
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2.5">
        <AccountMark account={account} className="size-8" />
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

function SectionLabel({
  className,
  children,
}: {
  readonly className?: string
  readonly children: string
}) {
  return <span className={cn("text-xs text-muted-foreground", className)}>{children}</span>
}

function AccountMark({
  account,
  className,
}: {
  readonly account: ClaudeAccount
  readonly className: string
}) {
  return (
    <span className="relative shrink-0">
      <ClaudeMark className={className} />
      <ToneDot
        tone={summarizeClaude(account.status).tone}
        className="absolute -right-0.5 -bottom-0.5 ring-2 ring-popover"
      />
    </span>
  )
}

function AccountText({ account }: { readonly account: ClaudeAccount }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{account.name}</span>
      <span className="truncate text-xs text-muted-foreground">{accountLine(account.status)}</span>
    </span>
  )
}
