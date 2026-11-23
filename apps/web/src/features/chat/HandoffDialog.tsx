import { useAtomSet } from "@effect/atom-react"
import type { HandoffPreview, HandoffPreviewEntry, SessionId } from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { Bot, Info, type LucideIcon, User } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { handoffPreviewAtom, trimHandoffAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { changedExclusions, excludedOf, toggledExclusion } from "./handoffTrim.ts"
import { formatTokens, handoffWeight, type HandoffWeight } from "./providerSwitch.ts"

const KIND: Record<
  HandoffPreviewEntry["kind"],
  { readonly icon: LucideIcon; readonly label: string }
> = {
  human: { icon: User, label: "You" },
  agent: { icon: Bot, label: "Agent" },
  event: { icon: Info, label: "Humanity" },
}

const WEIGHT_CLASS: Record<HandoffWeight, string> = {
  light: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  heavy: "bg-destructive/10 text-destructive",
}

const SPEAKER = /^(Human|Agent \([^)]*\)|Humanity): /

export function HandoffDialog({
  sessionId,
  target,
  open,
  onClose,
}: {
  readonly sessionId: SessionId
  readonly target: string
  readonly open: boolean
  readonly onClose: () => void
}) {
  const load = useAtomSet(handoffPreviewAtom, { mode: "promiseExit" })
  const trim = useAtomSet(trimHandoffAtom, { mode: "promiseExit" })
  const [preview, setPreview] = useState<HandoffPreview | null>()
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set())
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    let current = true
    void load({ payload: { sessionId } }).then((exit) => {
      if (!current) return
      if (Exit.isFailure(exit)) {
        setError(describeCause(exit.cause))
        return
      }
      setPreview(exit.value)
      setExcluded(excludedOf(exit.value))
    })
    return () => {
      current = false
    }
  }, [load, open, sessionId])

  const changed = preview != null && changedExclusions(preview, excluded)

  const apply = async () => {
    setPending(true)
    setError(undefined)
    const exit = await trim({ payload: { sessionId, excluded: [...excluded] } })
    setPending(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    setPreview(exit.value)
    setExcluded(excludedOf(exit.value))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Context for {target}</DialogTitle>
          <DialogDescription>
            What the agent reads in front of your next message. Untick an entry to leave it out; the
            agent is told it was left out by you.
          </DialogDescription>
        </DialogHeader>
        {preview === undefined ? (
          error === undefined && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Building the handoff…
            </div>
          )
        ) : preview === null ? (
          <p className="text-sm text-muted-foreground">
            Nothing waits to be handed off: the agent already has it.
          </p>
        ) : (
          <HandoffBody
            preview={preview}
            excluded={excluded}
            onToggle={(index) => setExcluded((current) => toggledExclusion(current, index))}
          />
        )}
        {error !== undefined && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {preview?.editable === true && (
            <Button disabled={!changed || pending} onClick={() => void apply()}>
              {pending && <Spinner />}
              Apply
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HandoffBody({
  preview,
  excluded,
  onToggle,
}: {
  readonly preview: HandoffPreview
  readonly excluded: ReadonlySet<number>
  readonly onToggle: (index: number) => void
}) {
  const summary = [
    `${preview.included} in full`,
    ...(preview.omitted > 0 ? [`${preview.omitted} for the agent to read when it needs them`] : []),
    ...(preview.cut > 0 ? [`${preview.cut} left out by you`] : []),
  ].join(" · ")
  return (
    <Tabs defaultValue={preview.editable ? "entries" : "text"} className="min-h-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {preview.editable ? (
          <TabsList>
            <TabsTrigger value="entries">Entries</TabsTrigger>
            <TabsTrigger value="text">As the agent reads it</TabsTrigger>
          </TabsList>
        ) : (
          <span className="text-xs text-muted-foreground">
            This handoff came from a rewind or a fork, so it can be read but not changed.
          </span>
        )}
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {preview.editable && summary}
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium tabular-nums",
              WEIGHT_CLASS[handoffWeight(preview.tokens)],
            )}
          >
            ~{formatTokens(preview.tokens)} tokens
          </span>
        </span>
      </div>
      <TabsContent value="entries" className="min-h-0 overflow-y-auto">
        <ul className="flex flex-col divide-y rounded-md border">
          {preview.entries.map((entry) => (
            <HandoffEntryRow
              key={entry.index}
              entry={entry}
              included={!excluded.has(entry.index)}
              onToggle={() => onToggle(entry.index)}
            />
          ))}
        </ul>
      </TabsContent>
      <TabsContent value="text" className="min-h-0 overflow-y-auto">
        <pre className="rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap wrap-anywhere">
          {preview.text}
        </pre>
      </TabsContent>
    </Tabs>
  )
}

function HandoffEntryRow({
  entry,
  included,
  onToggle,
}: {
  readonly entry: HandoffPreviewEntry
  readonly included: boolean
  readonly onToggle: () => void
}) {
  const kind = KIND[entry.kind]
  const id = `handoff-entry-${entry.index}`
  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <Checkbox id={id} checked={included} onCheckedChange={onToggle} className="mt-0.5" />
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <kind.icon className="size-3.5" aria-hidden />
          <span>
            #{entry.index} {kind.label}
          </span>
          {included && entry.state === "omitted" && (
            <span>· left for the agent to read when it needs it</span>
          )}
        </span>
        <span
          className={cn(
            "line-clamp-3 text-sm whitespace-pre-wrap wrap-anywhere",
            !included && "text-muted-foreground line-through",
          )}
        >
          {entry.text.replace(SPEAKER, "")}
        </span>
      </label>
    </li>
  )
}
