import { useAtomSet } from "@effect/atom-react"
import type { FileSearchResult, SessionId } from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { CaseSensitive, ChevronRight, Regex, WholeWord } from "lucide-react"
import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Toggle } from "@/components/ui/toggle"
import { describeCause } from "@/lib/errors"
import { searchFilesAtom } from "./atoms.ts"
import { FileIcon } from "./FileIcon.tsx"
import { matchRange } from "./fileSearchView.ts"
import { nameOf } from "./tree.ts"

const SEARCH_DELAY_MS = 250

export function FileSearch({
  sessionId,
  icons,
  onReveal,
}: {
  readonly sessionId: SessionId
  readonly icons: boolean
  readonly onReveal: (path: string, line: number, column: number, length: number) => void
}) {
  const search = useAtomSet(searchFilesAtom, { mode: "promiseExit" })
  const [query, setQuery] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  const [include, setInclude] = useState("")
  const [exclude, setExclude] = useState("")
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [found, setFound] = useState<{
    readonly key: string
    readonly result?: FileSearchResult
    readonly error?: string
  }>()

  const key = JSON.stringify([query, caseSensitive, wholeWord, regex, include, exclude])

  useEffect(() => {
    if (query === "") return
    let current = true
    const timer = setTimeout(() => {
      void search({
        payload: {
          sessionId,
          options: {
            query,
            caseSensitive,
            wholeWord,
            regex,
            ...(include.trim() === "" ? {} : { include }),
            ...(exclude.trim() === "" ? {} : { exclude }),
          },
        },
      }).then((exit) => {
        if (!current) return
        setFound(
          Exit.isSuccess(exit)
            ? { key, result: exit.value }
            : { key, error: describeCause(exit.cause) },
        )
      })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [caseSensitive, exclude, include, key, query, regex, search, sessionId, wholeWord])

  const shown = found?.key === key ? found : undefined
  const result = shown?.result

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-1.5 border-b p-2">
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search in files"
            aria-label="Search in files"
            className="h-7 min-w-0 flex-1 text-sm"
            spellCheck={false}
          />
          <Toggle
            size="sm"
            pressed={caseSensitive}
            onPressedChange={setCaseSensitive}
            aria-label="Match case"
            title="Match case"
          >
            <CaseSensitive />
          </Toggle>
          <Toggle
            size="sm"
            pressed={wholeWord}
            onPressedChange={setWholeWord}
            aria-label="Match whole word"
            title="Match whole word"
          >
            <WholeWord />
          </Toggle>
          <Toggle
            size="sm"
            pressed={regex}
            onPressedChange={setRegex}
            aria-label="Use a regular expression"
            title="Use a regular expression"
          >
            <Regex />
          </Toggle>
        </div>
        <Input
          value={include}
          onChange={(event) => setInclude(event.target.value)}
          placeholder="Files to include, e.g. *.ts, src/**"
          aria-label="Files to include"
          className="h-7 text-xs"
          spellCheck={false}
        />
        <Input
          value={exclude}
          onChange={(event) => setExclude(event.target.value)}
          placeholder="Files to exclude"
          aria-label="Files to exclude"
          className="h-7 text-xs"
          spellCheck={false}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1 text-[0.8125rem] scrollbar-thin">
        {query === "" ? null : shown === undefined ? (
          <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
            <Spinner /> Searching…
          </div>
        ) : shown.error !== undefined ? (
          <p className="px-3 py-2 text-destructive">{shown.error}</p>
        ) : result === undefined || result.matches === 0 ? (
          <p className="px-3 py-2 text-muted-foreground">No results.</p>
        ) : (
          <>
            <p className="px-3 pb-1 text-xs text-muted-foreground">
              {result.matches} result{result.matches === 1 ? "" : "s"} in {result.files.length} file
              {result.files.length === 1 ? "" : "s"}
              {result.truncated && ", more left out: narrow the search"}
            </p>
            {result.files.map((file) => {
              const open = !collapsed.has(file.path)
              return (
                <div key={file.path}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-1 px-2 py-0.5 text-left hover:bg-muted/60"
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current)
                        if (open) next.add(file.path)
                        else next.delete(file.path)
                        return next
                      })
                    }
                    title={file.path}
                  >
                    <ChevronRight
                      className={cn("size-3.5 shrink-0 text-muted-foreground", open && "rotate-90")}
                    />
                    {icons && <FileIcon path={file.path} folder={false} expanded={false} />}
                    <span className="truncate font-medium">{nameOf(file.path)}</span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {file.path.includes("/")
                        ? file.path.slice(0, file.path.lastIndexOf("/"))
                        : ""}
                    </span>
                    <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-xs tabular-nums">
                      {file.matches.length}
                    </span>
                  </button>
                  {open &&
                    file.matches.map((match) => {
                      const range = matchRange(match, query, { caseSensitive, regex })
                      return (
                        <button
                          key={`${match.line}:${match.column}`}
                          type="button"
                          className="flex w-full items-baseline gap-2 py-0.5 pr-2 pl-8 text-left font-mono text-xs hover:bg-muted/60"
                          onClick={() =>
                            onReveal(file.path, match.line, match.column, range?.length ?? 0)
                          }
                        >
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {match.line}
                          </span>
                          <span className="min-w-0 truncate">
                            {range === undefined ? (
                              match.preview
                            ) : (
                              <>
                                {match.preview.slice(0, range.start)}
                                <mark className="rounded-sm bg-warning/25 text-foreground">
                                  {match.preview.slice(range.start, range.start + range.length)}
                                </mark>
                                {match.preview.slice(range.start + range.length)}
                              </>
                            )}
                          </span>
                        </button>
                      )
                    })}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
