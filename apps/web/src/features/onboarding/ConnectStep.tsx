import { AsyncResult } from "effect/reactivity"
import { useCallback, useId } from "react"
import { InlineError } from "@/components/InlineError"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { AddProviderAccount } from "@/features/providers/AddProviderAccount"
import { useProviderAccounts } from "@/features/providers/providerAccounts"
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "@/features/providers/ProviderIcon"
import { openSettings } from "@/features/settings/settings"
import { usePollWhile } from "@/lib/usePollWhile"
import { useHistoryImport } from "./historyImport.ts"
import { ServiceRow } from "./ServiceRow.tsx"

export function ConnectStep() {
  const history = useHistoryImport()
  const switchId = useId()

  return (
    <div className="flex w-full flex-col gap-4">
      <h2 className="text-center text-xl font-semibold tracking-tight">Connect your agents</h2>
      <ul className="flex flex-col gap-2">
        {PROVIDER_IDS.map((provider) => (
          <ProviderRows key={provider} provider={provider} />
        ))}
      </ul>
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Have another account?</span>
        <AddProviderAccount />
      </div>
      <Field orientation="horizontal" className="gap-3">
        <FieldLabel htmlFor={switchId} className="font-normal">
          Import your existing Claude Code threads
        </FieldLabel>
        <Switch
          id={switchId}
          checked={history.enabled}
          disabled={!history.ready}
          onCheckedChange={(checked) => void history.setEnabled(checked)}
        />
      </Field>
      {history.error !== undefined && <InlineError>{history.error}</InlineError>}
    </div>
  )
}

function ProviderRows({ provider }: { readonly provider: ProviderId }) {
  const { result, refresh, refreshing } = useProviderAccounts(provider)
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const waiting = accounts?.some((account) => account.state !== "connected") === true
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(waiting, poll, refreshing)

  const { name, Icon } = PROVIDERS[provider]
  const icon = <Icon className="size-6" aria-hidden="true" />

  if (accounts === undefined) {
    return (
      <ServiceRow
        icon={icon}
        name={name}
        state={AsyncResult.isFailure(result) ? "disconnected" : undefined}
      />
    )
  }
  return accounts.map((account) => (
    <ServiceRow
      key={account.id}
      icon={icon}
      name={accounts.length > 1 ? `${name} · ${account.name}` : name}
      state={account.state === "connected" ? "connected" : "disconnected"}
      detail={account.detail}
    >
      {account.state !== "connected" && (
        <Button
          variant="brand-link"
          size="xs"
          className="h-auto self-start p-0"
          onClick={() => openSettings("providers", provider)}
        >
          {account.state === "signedOut"
            ? "Open Settings to sign in"
            : "Open Settings to set it up"}
        </Button>
      )}
    </ServiceRow>
  ))
}
