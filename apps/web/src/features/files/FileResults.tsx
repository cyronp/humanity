import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { DEFAULT_EDITOR_PREFERENCES, type FileEntry, type SessionId } from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useState } from "react"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { Spinner } from "@/components/ui/spinner"
import type { PaletteResultsProps } from "@/features/palette/registry"
import { searchSessionFilesAtom } from "@/features/session/atoms"
import { editorPreferencesAtom } from "./atoms.ts"
import { requestOpenFile } from "./openRequest.ts"
import { FileEntryLabel } from "./FileEntryLabel.tsx"

const SEARCH_DELAY_MS = 120
const SHOWN = 50

export function FileResults({
  sessionId,
  query,
  close,
}: PaletteResultsProps & { readonly sessionId: SessionId }) {
  const search = useAtomSet(searchSessionFilesAtom, { mode: "promiseExit" })
  const stored = useAtomValue(editorPreferencesAtom)
  const icons = (AsyncResult.isSuccess(stored) ? stored.value : DEFAULT_EDITOR_PREFERENCES)
    .fileIcons
  const [found, setFound] = useState<{
    readonly query: string
    readonly files: ReadonlyArray<FileEntry>
  }>()

  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      void search({ payload: { sessionId, query, recent: [] } }).then((exit) => {
        if (!current) return
        setFound({
          query,
          files: Exit.isSuccess(exit) ? exit.value.filter((entry) => entry.kind === "file") : [],
        })
      })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, search, sessionId])

  const files = found?.files.slice(0, SHOWN) ?? []
  return (
    <>
      {found === undefined || found.query !== query ? (
        files.length === 0 && (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
            <Spinner /> Searching…
          </div>
        )
      ) : (
        <CommandEmpty>No file matches.</CommandEmpty>
      )}
      {files.length > 0 && (
        <CommandGroup heading="Files">
          {files.map((entry) => (
            <CommandItem
              key={entry.path}
              value={`file ${entry.path}`}
              check={false}
              onSelect={() => {
                close()
                requestOpenFile(sessionId, entry.path)
              }}
            >
              <FileEntryLabel path={entry.path} icons={icons} />
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  )
}
