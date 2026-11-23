import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { DEFAULT_EDITOR_PREFERENCES, type FileEntry, type SessionId } from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { File } from "lucide-react"
import { useEffect, useState } from "react"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { Spinner } from "@/components/ui/spinner"
import type { PaletteResultsProps } from "@/features/palette/registry"
import { searchSessionFilesAtom } from "@/features/session/atoms"
import { editorPreferencesAtom } from "./atoms.ts"
import { FileIcon } from "./FileIcon.tsx"
import { requestOpenFile } from "./openRequest.ts"
import { nameOf } from "./tree.ts"

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
              onSelect={() => {
                close()
                requestOpenFile(sessionId, entry.path)
              }}
            >
              {icons ? <FileIcon path={entry.path} /> : <File className="text-muted-foreground" />}
              <span className="shrink-0 truncate">{nameOf(entry.path)}</span>
              <span className="ml-auto min-w-0 truncate text-right font-mono text-xs text-muted-foreground">
                {entry.path}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  )
}
