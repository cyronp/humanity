import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { antigravityStatusAtom } from "@/features/antigravity/atoms"
import { claudeStatusAtom } from "@/features/claude/atoms"
import { codexStatusAtom } from "@/features/codex/atoms"
import { kiroStatusAtom } from "@/features/kiro/atoms"
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
