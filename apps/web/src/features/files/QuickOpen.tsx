import { useAtomSet } from "@effect/atom-react"
import type { FileEntry, SessionId } from "@humanity/contracts"
import { Exit } from "effect"
import { useEffect, useState } from "react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { searchSessionFilesAtom } from "@/features/session/atoms"
import { FileEntryLabel } from "./FileEntryLabel.tsx"

export function QuickOpen({
  sessionId,
  open,
  recent,
  onOpenChange,
  onPick,
  icons,
}: {
  readonly icons: boolean
  readonly sessionId: SessionId
  readonly open: boolean
  readonly recent: ReadonlyArray<string>
  readonly onOpenChange: (open: boolean) => void
  readonly onPick: (path: string) => void
}) {
  const search = useAtomSet(searchSessionFilesAtom, { mode: "promiseExit" })
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<ReadonlyArray<FileEntry>>([])
  const [selected, setSelected] = useState("")

  useEffect(() => {
    if (!open) return
    let current = true
    void search({ payload: { sessionId, query, recent: [...recent] } }).then((exit) => {
      if (current && Exit.isSuccess(exit)) {
        const files = exit.value.filter((entry) => entry.kind === "file")
        setFound(files)
        setSelected(files[0]?.path ?? "")
      }
    })
    return () => {
      current = false
    }
  }, [open, query, recent, search, sessionId])

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("")
        onOpenChange(next)
      }}
      title="Go to a file"
      description="Type part of a file's name or path."
    >
      <Command shouldFilter={false} value={selected} onValueChange={setSelected}>
        <CommandInput placeholder="Go to a file…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No file matches.</CommandEmpty>
          {found.map((entry) => (
            <CommandItem
              key={entry.path}
              value={entry.path}
              onSelect={() => {
                onPick(entry.path)
                setQuery("")
                onOpenChange(false)
              }}
            >
              <FileEntryLabel path={entry.path} icons={icons} />
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
