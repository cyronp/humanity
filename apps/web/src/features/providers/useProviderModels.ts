import { useAtomValue } from "@effect/atom-react"
import type { ProviderAccount, ProviderStatus } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { providerAccountsAtom, providerStatusAtom } from "./accounts/atoms.ts"
import { type PickerModel, pickerModels } from "./models.ts"
import { PROVIDER_IDS, type ProviderId } from "./ProviderIcon.tsx"

export interface ProviderModels {
  readonly models: Readonly<Record<ProviderId, ReadonlyArray<PickerModel>>>
  readonly connected: Readonly<Record<ProviderId, boolean>>
  readonly answered: Readonly<Record<ProviderId, boolean>>
}

const perProvider = <A>(value: (provider: ProviderId) => A): Readonly<Record<ProviderId, A>> =>
  Object.fromEntries(PROVIDER_IDS.map((provider) => [provider, value(provider)])) as Record<
    ProviderId,
    A
  >

export const useProviderStatuses = (): Readonly<
  Record<ProviderId, AsyncResult.AsyncResult<ProviderStatus, unknown>>
> => ({
  "claude-code": useAtomValue(providerStatusAtom("claude-code")),
  codex: useAtomValue(providerStatusAtom("codex")),
  kiro: useAtomValue(providerStatusAtom("kiro")),
  antigravity: useAtomValue(providerStatusAtom("antigravity")),
})

export const useProviderAccountLists = (): Readonly<
  Record<ProviderId, AsyncResult.AsyncResult<ReadonlyArray<ProviderAccount>, unknown>>
> => ({
  "claude-code": useAtomValue(providerAccountsAtom("claude-code")),
  codex: useAtomValue(providerAccountsAtom("codex")),
  kiro: useAtomValue(providerAccountsAtom("kiro")),
  antigravity: useAtomValue(providerAccountsAtom("antigravity")),
})

export const useProviderModels = (): ProviderModels => {
  const statuses = useProviderStatuses()
  const status = (provider: ProviderId) => {
    const result = statuses[provider]
    return AsyncResult.isSuccess(result) ? result.value : undefined
  }
  return {
    models: perProvider((provider) => pickerModels(provider, status(provider)?.models ?? [])),
    connected: perProvider((provider) => status(provider)?.connection._tag === "Connected"),
    answered: perProvider((provider) => AsyncResult.isSuccess(statuses[provider])),
  }
}

export interface PickerAccount {
  readonly id: string
  readonly name: string
  readonly active: boolean
  readonly connected: boolean
  readonly models: ReadonlyArray<PickerModel>
}

export const useProviderAccounts = (): Readonly<
  Record<ProviderId, ReadonlyArray<PickerAccount>>
> => {
  const listed = useProviderAccountLists()
  return perProvider((provider) => {
    const result = listed[provider]
    return AsyncResult.isSuccess(result)
      ? result.value.map((account) => ({
          id: account.id,
          name: account.name,
          active: account.active,
          connected: account.status.connection._tag === "Connected",
          models: pickerModels(provider, account.status.models),
        }))
      : []
  })
}
