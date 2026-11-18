import type { ISearchDecorationOptions, ISearchOptions, SearchAddon } from "@xterm/addon-search"
import { cn } from "cn"
import { ArrowDown, ArrowUp, CaseSensitive, Regex, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

const DECORATIONS: ISearchDecorationOptions = {
  matchBackground: "#facc1560",
  matchOverviewRuler: "#facc15",
  activeMatchBackground: "#f97316",
  activeMatchColorOverviewRuler: "#f97316",
}

/** A find bar over the shown terminal: Enter finds the next match, Shift+Enter the previous. */
export function TerminalFind({
  search,
  onClose,
}: {
  readonly search: SearchAddon
  readonly onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [results, setResults] = useState<{ index: number; count: number }>()

  useEffect(() => {
    input.current?.select()
    const changed = search.onDidChangeResults(({ resultIndex, resultCount }) =>
      setResults({ index: resultIndex, count: resultCount }),
    )
    return () => {
      changed.dispose()
      search.clearDecorations()
    }
  }, [search])

  const options = (): ISearchOptions => ({ caseSensitive, regex, decorations: DECORATIONS })

  const find = (direction: "next" | "previous") => {
    if (query === "") return
    if (direction === "next") search.findNext(query, options())
    else search.findPrevious(query, options())
  }

  // Searching as the human types, from where the last match was.
  useEffect(() => {
    if (query === "") search.clearDecorations()
    else
      search.findNext(query, { caseSensitive, regex, incremental: true, decorations: DECORATIONS })
  }, [query, caseSensitive, regex, search])

  const toggleClass = (on: boolean) =>
    cn("size-6", on ? "bg-muted text-foreground" : "text-muted-foreground")

  return (
    <div
      role="search"
      className="absolute top-1 right-3 z-20 flex items-center gap-0.5 rounded-md border bg-popover p-0.5 shadow-md"
    >
      <input
        ref={input}
        value={query}
        aria-label="Find in terminal"
        placeholder="Find"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onClose()
          } else if (event.key === "Enter") {
            event.preventDefault()
            find(event.shiftKey ? "previous" : "next")
          }
        }}
        className="h-6 w-40 bg-transparent px-1.5 text-xs outline-none"
      />
      <span className="min-w-12 px-1 text-right text-[11px] text-muted-foreground tabular-nums">
        {results === undefined || query === ""
          ? ""
          : results.count === 0
            ? "No results"
            : `${results.index + 1} of ${results.count}`}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Match case"
        aria-pressed={caseSensitive}
        className={toggleClass(caseSensitive)}
        onClick={() => setCaseSensitive(!caseSensitive)}
      >
        <CaseSensitive />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Use regular expression"
        aria-pressed={regex}
        className={toggleClass(regex)}
        onClick={() => setRegex(!regex)}
      >
        <Regex />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Previous match"
        onClick={() => find("previous")}
      >
        <ArrowUp />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Next match" onClick={() => find("next")}>
        <ArrowDown />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Close find" onClick={onClose}>
        <X />
      </Button>
    </div>
  )
}
