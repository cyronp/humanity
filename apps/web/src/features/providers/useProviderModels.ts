import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { antigravityAccountsAtom, antigravityStatusAtom } from "@/features/antigravity/atoms"
import { claudeAccountsAtom, claudeStatusAtom } from "@/features/claude/atoms"
import { codexAccountsAtom, codexStatusAtom } from "@/features/codex/atoms"
import { kiroAccountsAtom, kiroStatusAtom } from "@/features/kiro/atoms"
import { type PickerModel, pickerModels, type ReportedModel } from "./models.ts"
import type { ProviderId } from "./ProviderIcon.tsx"

export interface ProviderModels {
  /** Each provider's models, as the model picker lists them. */
  readonly models: Readonly<Record<ProviderId, ReadonlyArray<PickerModel>>>
  /** Whether a provider is signed in. */
  readonly connected: Readonly<Record<ProviderId, boolean>>
  /** Whether a provider's status has been read yet. */
  readonly answered: Readonly<Record<ProviderId, boolean>>
}

/** What every provider offers the active account: the model picker's source, and its names'. */
export const useProviderModels = (): ProviderModels => {
  const claude = useAtomValue(claudeStatusAtom)
  const codex = useAtomValue(codexStatusAtom)
  const kiro = useAtomValue(kiroStatusAtom)
  const antigravity = useAtomValue(antigravityStatusAtom)
  const reported = (
    result: AsyncResult.AsyncResult<{ readonly models: ReadonlyArray<ReportedModel> }, unknown>,
  ) => (AsyncResult.isSuccess(result) ? result.value.models : [])
  const signedIn = (
    result: AsyncResult.AsyncResult<{ readonly connection: { readonly _tag: string } }, unknown>,
  ) => AsyncResult.isSuccess(result) && result.value.connection._tag === "Connected"
  return {
    models: {
      "claude-code": pickerModels("claude-code", reported(claude)),
      codex: pickerModels("codex", reported(codex)),
      kiro: pickerModels("kiro", reported(kiro)),
      antigravity: pickerModels("antigravity", reported(antigravity)),
    },
    connected: {
      "claude-code": signedIn(claude),
      codex: signedIn(codex),
      kiro: signedIn(kiro),
      antigravity: signedIn(antigravity),
    },
    answered: {
      "claude-code": AsyncResult.isSuccess(claude),
      codex: AsyncResult.isSuccess(codex),
      kiro: AsyncResult.isSuccess(kiro),
      antigravity: AsyncResult.isSuccess(antigravity),
    },
  }
}

/** An account of a provider, with the models it offers, for the thread's model picker. */
export interface PickerAccount {
  readonly id: string
  readonly name: string
  readonly active: boolean
  readonly connected: boolean
  readonly models: ReadonlyArray<PickerModel>
}

interface ListedAccount {
  readonly id: string
  readonly name: string
  readonly active: boolean
  readonly status: {
    readonly connection: { readonly _tag: string }
    readonly models: ReadonlyArray<ReportedModel>
  }
}

/** Every provider's accounts: a thread can move to any signed-in one. */
export const useProviderAccounts = (): Readonly<
  Record<ProviderId, ReadonlyArray<PickerAccount>>
> => {
  const claude = useAtomValue(claudeAccountsAtom)
  const codex = useAtomValue(codexAccountsAtom)
  const kiro = useAtomValue(kiroAccountsAtom)
  const antigravity = useAtomValue(antigravityAccountsAtom)
  const accounts = (
    provider: ProviderId,
    result: AsyncResult.AsyncResult<ReadonlyArray<ListedAccount>, unknown>,
  ): ReadonlyArray<PickerAccount> =>
    AsyncResult.isSuccess(result)
      ? result.value.map((account) => ({
          id: account.id,
          name: account.name,
          active: account.active,
          connected: account.status.connection._tag === "Connected",
          models: pickerModels(provider, account.status.models),
        }))
      : []
  return {
    "claude-code": accounts("claude-code", claude),
    codex: accounts("codex", codex),
    kiro: accounts("kiro", kiro),
    antigravity: accounts("antigravity", antigravity),
  }
}
