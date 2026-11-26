import type { AgentProvider, ProviderAccount } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"

export type AccountsResult = AsyncResult.AsyncResult<ReadonlyArray<ProviderAccount>, unknown>

export interface ConfiguredProviders {
  readonly shown: ReadonlyArray<AgentProvider>
  readonly reading: boolean
}

export const configuredProviders = (
  results: ReadonlyArray<readonly [AgentProvider, AccountsResult]>,
): ConfiguredProviders => ({
  shown: results.flatMap(([provider, result]) =>
    AsyncResult.isFailure(result) ||
    (AsyncResult.isSuccess(result) &&
      result.value.some((account) => account.status.connection._tag === "Connected"))
      ? [provider]
      : [],
  ),
  reading: results.some(([, result]) => AsyncResult.isInitial(result)),
})
