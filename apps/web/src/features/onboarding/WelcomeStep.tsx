import {
  Check,
  FileDiff,
  GitBranch,
  type LucideIcon,
  MessageSquareReply,
  ShieldCheck,
  X,
} from "lucide-react"
import { ClaudeMark } from "@/features/claude/ClaudeMark"

const PRINCIPLES: ReadonlyArray<{
  readonly icon: LucideIcon
  readonly title: string
  readonly body: string
}> = [
  {
    icon: FileDiff,
    title: "Every edit waits for you",
    body: "Changes are split into hunks before they touch disk. Approve, reject or comment on each one.",
  },
  {
    icon: MessageSquareReply,
    title: "A rejection is a conversation",
    body: "Your comment goes back to Claude as feedback, so it can correct course instead of guessing.",
  },
  {
    icon: ShieldCheck,
    title: "Commands ask first",
    body: "Reading code is automatic. Shell commands and MCP tools show what they will run and wait for your OK.",
  },
  {
    icon: GitBranch,
    title: "Your working copy stays yours",
    body: "Each session works on its own branch, in its own git worktree. Your checkout is never touched.",
  },
]

export function WelcomeStep() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            The agent proposes. <span className="text-muted-foreground">You decide.</span>
          </h1>
          <p className="max-w-prose text-muted-foreground">
            Humanity is a coding agent built around a human in the loop. Claude does the work, and
            you review it change by change while it happens, not in one big diff at the end.
          </p>
        </div>
        <HunkPreview />
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {PRINCIPLES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3 rounded-xl border p-4">
            <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{title}</span>
              <span className="text-sm text-muted-foreground">{body}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A still picture of the review panel: what "approve each hunk" looks like. */
function HunkPreview() {
  return (
    <figure
      aria-label="Example: Claude proposes one hunk in src/app.ts and waits for your decision"
      className="w-full max-w-sm overflow-hidden rounded-xl border bg-card text-xs shadow-sm md:w-80"
    >
      <figcaption className="flex items-center gap-2 border-b px-3 py-2">
        <ClaudeMark className="size-4" />
        <span className="font-medium">Claude proposes</span>
        <code className="ml-auto text-muted-foreground">src/app.ts</code>
      </figcaption>
      <div className="font-mono leading-5" aria-hidden="true">
        <div className="px-3 text-muted-foreground">@@ hunk 1 of 2 @@</div>
        <div className="bg-destructive/10 px-3">
          <span className="text-destructive">- </span>if (!user) return null
        </div>
        <div className="bg-emerald-500/10 px-3">
          <span className="text-emerald-600 dark:text-emerald-400">+ </span>if (!user) throw new
          AuthError()
        </div>
        <div className="px-3 text-muted-foreground">{"  "}return render(user)</div>
      </div>
      <div className="flex items-center gap-2 border-t px-3 py-2" aria-hidden="true">
        <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground">
          <Check className="size-3" /> Approve
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium">
          <X className="size-3" /> Reject with comment
        </span>
        <span className="ml-auto text-muted-foreground">waiting for you</span>
      </div>
    </figure>
  )
}
