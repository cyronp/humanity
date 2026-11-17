import { type FileEntry, mentionedPaths } from "@humanity/contracts"
import { Exit } from "effect"
import {
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react"
import { describeCause } from "@/lib/errors"
import { completeMention, findMention } from "./fileMention.ts"

export type FileSearch = (query: string) => Promise<Exit.Exit<ReadonlyArray<FileEntry>, unknown>>

const SEARCH_DELAY_MS = 150

export interface FileMentionMenuState {
  readonly entries: ReadonlyArray<FileEntry>
  readonly highlighted: number
  readonly searching: boolean
  readonly error: string | undefined
  readonly pick: (entry: FileEntry) => void
  readonly highlight: (index: number) => void
}

export function useFileMention({
  text,
  setText,
  textarea,
  search,
  disabled = false,
}: {
  readonly text: string
  readonly setText: Dispatch<SetStateAction<string>>
  readonly textarea: RefObject<HTMLTextAreaElement | null>
  readonly search: FileSearch
  readonly disabled?: boolean
}) {
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState<number>()
  const [highlightState, setHighlight] = useState({ query: "", index: 0 })
  const [chosen, setChosen] = useState<ReadonlyArray<string>>([])
  const picked = useMemo(() => mentionedPaths(text, chosen), [text, chosen])
  const [results, setResults] = useState<{
    readonly query: string
    readonly entries: ReadonlyArray<FileEntry>
    readonly error?: string
  }>()

  const found = disabled || !focused ? undefined : findMention(text, caret)
  const mention = found !== undefined && found.start !== dismissed ? found : undefined
  const query = mention?.query

  const runSearch = useEffectEvent(search)
  useEffect(() => {
    if (query === undefined) return
    let current = true
    const timer = setTimeout(() => {
      void runSearch(query).then((exit) => {
        if (!current) return
        setResults(
          Exit.isSuccess(exit)
            ? { query, entries: exit.value }
            : { query, entries: [], error: describeCause(exit.cause) },
        )
      })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  const entries = results?.entries ?? []
  const searching = results?.query !== query
  const highlighted =
    highlightState.query === query ? Math.min(highlightState.index, entries.length - 1) : 0

  const pick = (entry: FileEntry) => {
    if (mention === undefined) return
    const edit = completeMention(text, mention, caret, entry)
    const path = entry.kind === "directory" ? `${entry.path}/` : entry.path
    setChosen((previous) => (previous.includes(path) ? previous : [...previous, path]))
    setText(edit.text)
    setCaret(edit.caret)
    requestAnimationFrame(() => {
      const box = textarea.current
      if (box === null) return
      box.focus()
      box.setSelectionRange(edit.caret, edit.caret)
    })
  }

  const highlight = (index: number) => setHighlight({ query: query ?? "", index })

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (mention === undefined || event.nativeEvent.isComposing) return false
    const count = entries.length
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (count === 0) return false
        const step = event.key === "ArrowDown" ? 1 : -1
        highlight((Math.max(highlighted, 0) + step + count) % count)
        break
      }
      case "Enter":
      case "Tab": {
        if (event.shiftKey) return false
        if (searching) break
        const entry = entries[Math.max(highlighted, 0)]
        if (entry === undefined) return false
        pick(entry)
        break
      }
      case "Escape":
        setDismissed(mention.start)
        break
      default:
        return false
    }
    event.preventDefault()
    return true
  }

  const textareaProps = {
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value
      const at = event.target.selectionStart
      setText(value)
      setCaret(at)
      if (findMention(value, at)?.start !== dismissed) setDismissed(undefined)
    },
    onSelect: (event: { readonly currentTarget: HTMLTextAreaElement }) =>
      setCaret(event.currentTarget.selectionStart),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  }

  const menu: FileMentionMenuState | undefined =
    mention === undefined
      ? undefined
      : {
          entries,
          highlighted,
          searching,
          error: results?.query === query ? results?.error : undefined,
          pick,
          highlight,
        }

  return { menu, onKeyDown, textareaProps, picked, forgetPicked: () => setChosen([]) }
}
