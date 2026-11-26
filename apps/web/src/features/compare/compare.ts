import type { CompareRun, CompareRunRequest, ReasoningEffort } from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import type { ModelChoice } from "@/features/providers/models"
import { useAtomValue } from "@effect/atom-react"
import { Atom } from "effect/reactivity"
import { registry } from "@/lib/registry"

export const compareRuns = (
  main: ModelChoice,
  extra: ReadonlyArray<ModelChoice>,
  effort: ReasoningEffort | null,
): ReadonlyArray<CompareRunRequest> =>
  [main, ...extra].map((choice) => ({
    provider: choice.provider,
    ...(choice.model === null ? {} : { model: choice.model }),
    ...(effort === null ? {} : { effort }),
    ...(choice.accountId === undefined ? {} : { accountId: choice.accountId }),
  }))

export interface RunChanges {
  readonly files: number
  readonly added: number
  readonly removed: number
}

export const runChanges = (run: CompareRun): RunChanges | undefined => {
  if (run.diff === null) return undefined
  let added = 0
  let removed = 0
  for (const file of run.diff.files) {
    const counted = countChanges(file.hunks)
    added += counted.added
    removed += counted.removed
  }
  return { files: run.diff.files.length, added, removed }
}

export const sharedFiles = (runs: ReadonlyArray<CompareRun>): ReadonlySet<string> => {
  const seen = new Map<string, number>()
  for (const run of runs) {
    for (const file of run.diff?.files ?? []) {
      seen.set(file.filePath, (seen.get(file.filePath) ?? 0) + 1)
    }
  }
  return new Set([...seen].filter(([, count]) => count > 1).map(([path]) => path))
}

const groupOpenAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive)

export const openCompare = (groupId: string): void => registry.set(groupOpenAtom, groupId)

export const closeCompare = (): void => registry.set(groupOpenAtom, undefined)

export const useCompareOpen = (): string | undefined => useAtomValue(groupOpenAtom)
