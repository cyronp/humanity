import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { Info } from "lucide-react"
import type { ReactNode } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Kbd } from "@/components/ui/kbd"
import { claudeStatusAtom } from "@/features/claude/atoms"
import { isReady } from "@/features/claude/summary"

const NEXT: ReadonlyArray<{ readonly title: string; readonly body: ReactNode }> = [
  {
    title: "Add a project",
    body: "Point Humanity at a git repository on this computer. Nothing in it is modified.",
  },
  {
    title: "Start a session",
    body: (
      <>
        Humanity creates a <code>humanity/…</code> branch and a worktree for it, then you chat with
        Claude about the code.
      </>
    ),
  },
  {
    title: "Review as it works",
    body: (
      <>
        When Claude wants to edit a file, the review panel opens. Move with <Kbd>j</Kbd>{" "}
        <Kbd>k</Kbd>, approve with <Kbd>a</Kbd>, reject with <Kbd>r</Kbd>, comment with <Kbd>c</Kbd>{" "}
        and submit with <Kbd>Enter</Kbd>.
      </>
    ),
  },
  {
    title: "Confirm commands",
    body: "Shell commands and MCP tools appear as a card above the chat input until you allow or deny them.",
  },
]

export function ReadyStep() {
  const status = useAtomValue(claudeStatusAtom)
  const connected = AsyncResult.isSuccess(status) && isReady(status.value)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">You're set</h2>
        <p className="max-w-prose text-muted-foreground">Here is what a session looks like.</p>
      </div>
      <ol className="flex flex-col gap-4">
        {NEXT.map(({ title, body }, index) => (
          <li key={title} className="grid grid-cols-[auto_1fr] gap-x-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
              {index + 1}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{title}</span>
              <span className="text-sm text-muted-foreground">{body}</span>
            </div>
          </li>
        ))}
      </ol>
      {!connected && (
        <Alert>
          <Info />
          <AlertTitle>Claude is not connected yet</AlertTitle>
          <AlertDescription>
            You can add projects now. Agent sessions need a Claude account; the badge in the header
            takes you back to the connection step.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
