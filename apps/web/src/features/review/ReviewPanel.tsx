import type { ProposedChange } from "@humanity/contracts"
import { useEffect, useEffectEvent, useMemo, useState } from "react"
import { Kbd } from "@/components/ui/kbd"
import { ChangeReview, hunkKey, type ReviewRefs } from "./ChangeReview.tsx"
import { useReviewDrafts } from "./useReviewDrafts.ts"

interface Target {
  readonly changeId: string
  readonly filePath: string
  readonly index: number
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

/**
 * Every pending file change, hunk by hunk. Keyboard: `j`/`k` move between
 * hunks, `a` approve, `r` reject, `c` comment, `Enter` submit the change the
 * focused hunk belongs to (`Ctrl+Enter` from inside a comment).
 */
export function ReviewPanel({
  changes,
  file,
  hunk,
  onFocusChange,
}: {
  readonly changes: ReadonlyArray<ProposedChange>
  /** Deep link: the hunk to focus first, from `?file=&hunk=`. */
  readonly file: string | undefined
  readonly hunk: number | undefined
  readonly onFocusChange: (file: string, hunk: number) => void
}) {
  const drafts = useReviewDrafts()
  // Filled by the hunks' ref callbacks; one object for the panel's lifetime.
  const [refs] = useState<ReviewRefs>(() => ({ hunks: new Map(), comments: new Map() }))
  const targets = useMemo<Array<Target>>(
    () =>
      changes.flatMap((change) =>
        change.hunks.map((h) => ({
          changeId: change.id,
          filePath: change.filePath,
          index: h.index,
        })),
      ),
    [changes],
  )
  const [focusKey, setFocusKey] = useState<string>()

  // The deep link wins when it names a hunk that is under review.
  const linked = targets.find((target) => target.filePath === file && target.index === hunk)
  const focused =
    targets.find((target) => hunkKey(target.changeId, target.index) === focusKey) ??
    linked ??
    targets[0]

  const focus = (target: Target | undefined) => {
    if (target === undefined) return
    setFocusKey(hunkKey(target.changeId, target.index))
    onFocusChange(target.filePath, target.index)
  }

  // Keep the focused hunk on screen.
  const focusedKey = focused ? hunkKey(focused.changeId, focused.index) : undefined
  useEffect(() => {
    if (focusedKey === undefined) return
    refs.hunks.get(focusedKey)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [focusedKey])

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (focused === undefined || event.altKey || event.metaKey) return
    const key = hunkKey(focused.changeId, focused.index)

    if (isTyping(event.target)) {
      const inComment = event.target === refs.comments.get(key)
      if (event.key === "Escape") (event.target as HTMLElement).blur()
      else if (inComment && event.key === "Enter" && event.ctrlKey) {
        event.preventDefault()
        document.querySelector<HTMLButtonElement>(`[data-submit="${focused.changeId}"]`)?.click()
      }
      return
    }
    if (event.ctrlKey) return

    const position = targets.findIndex((target) => hunkKey(target.changeId, target.index) === key)
    switch (event.key) {
      case "j":
        focus(targets[Math.min(position + 1, targets.length - 1)])
        break
      case "k":
        focus(targets[Math.max(position - 1, 0)])
        break
      case "a":
        drafts.decide(focused.changeId, focused.index, "approved")
        break
      case "r":
        drafts.decide(focused.changeId, focused.index, "rejected")
        break
      case "c":
        refs.comments.get(key)?.focus()
        break
      case "Enter":
        document.querySelector<HTMLButtonElement>(`[data-submit="${focused.changeId}"]`)?.click()
        break
      default:
        return
    }
    event.preventDefault()
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  if (changes.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Nothing to review. Proposed file changes appear here and wait for you.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8 p-4">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Kbd>j</Kbd>/<Kbd>k</Kbd> move · <Kbd>a</Kbd> approve · <Kbd>r</Kbd> reject · <Kbd>c</Kbd>{" "}
        comment · <Kbd>Enter</Kbd> submit
      </p>
      {changes.map((change) => (
        <ChangeReview
          key={change.id}
          change={change}
          drafts={drafts}
          focusedIndex={focused?.changeId === change.id ? focused.index : undefined}
          onFocusHunk={(index) =>
            focus(targets.find((target) => target.changeId === change.id && target.index === index))
          }
          refs={refs}
        />
      ))}
    </div>
  )
}
