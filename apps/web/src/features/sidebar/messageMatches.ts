import { useAtomSet } from "@effect/atom-react"
import { SEARCH_MIN_LENGTH } from "@humanity/contracts"
import { Exit } from "effect"
import { useEffect, useState } from "react"
import { searchMessagesAtom } from "@/features/session/atoms"
import { firstHitPerThread, type MessageMatches } from "./threadFilter.ts"

const SEARCH_DELAY_MS = 250
const SIDEBAR_SEARCH_LIMIT = 200
const NONE: MessageMatches = new Map()

export const isMessageQuery = (query: string): boolean =>
  [...query.trim()].length >= SEARCH_MIN_LENGTH

export const useMessageMatches = (query: string): MessageMatches => {
  const search = useAtomSet(searchMessagesAtom, { mode: "promiseExit" })
  const [found, setFound] = useState<{ readonly query: string; readonly matches: MessageMatches }>()
  const trimmed = query.trim()
  const searchable = isMessageQuery(trimmed)

  useEffect(() => {
    if (!searchable) return
    let current = true
    const timer = setTimeout(() => {
      void search({ payload: { query: trimmed, limit: SIDEBAR_SEARCH_LIMIT } }).then((exit) => {
        if (!current) return
        setFound({
          query: trimmed,
          matches: Exit.isSuccess(exit) ? firstHitPerThread(exit.value) : NONE,
        })
      })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [search, searchable, trimmed])

  return searchable ? (found?.matches ?? NONE) : NONE
}
