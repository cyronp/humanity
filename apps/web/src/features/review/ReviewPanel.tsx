import type { ProposedChange } from "@humanity/contracts"
import { useEffect, useEffectEvent } from "react"
import { Kbd } from "@/components/ui/kbd"
import { ChangeReview } from "./ChangeReview.tsx"

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

/**
 * Every file change the agent waits on, each allowed or denied as a whole.
 * Keyboard, for the change at the top (or the one a link named): `a` allow,
 * `d` deny, `c` comment.
 */
export function ReviewPanel({
  changes,
  file,
}: {
  readonly changes: ReadonlyArray<ProposedChange>
  /** Deep link: the change to act on first, from `?file=`. */
  readonly file: string | undefined
}) {
  const current = changes.find((change) => change.filePath === file) ?? changes[0]
  const currentId = current?.id

  const within = (selector: string) =>
    currentId === undefined
      ? null
      : document.querySelector<HTMLElement>(`[data-change-id="${currentId}"] ${selector}`)

  // Keep the change the shortcuts act on in view.
  useEffect(() => {
    if (currentId === undefined) return
    document
      .querySelector(`[data-change-id="${currentId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [currentId])

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (currentId === undefined || event.altKey || event.metaKey || event.ctrlKey) return
    if (isTyping(event.target)) {
      if (event.key === "Escape") (event.target as HTMLElement).blur()
      return
    }
    switch (event.key) {
      case "a":
        within('[data-decide="allow"]')?.click()
        break
      case "d":
        within('[data-decide="deny"]')?.click()
        break
      case "c":
        within('[data-decide="comment"]')?.focus()
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
        Nothing is waiting for you. In a thread that asks first, each file change appears here until
        you allow or deny it.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8 p-4">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Kbd>a</Kbd> allow · <Kbd>d</Kbd> deny · <Kbd>c</Kbd> comment
      </p>
      {changes.map((change) => (
        <ChangeReview key={change.id} change={change} />
      ))}
    </div>
  )
}
