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
    title: "On its own by default",
    body: "A thread reads, edits and runs commands without stopping. Every call it makes shows in the chat.",
  },
  {
    icon: ShieldCheck,
    title: "Asked first, when you want",
    body: "Set a thread, a project or every new thread to ask. File changes and commands then wait for you to allow or deny them.",
  },
  {
    icon: MessageSquareReply,
    title: "A denial is a conversation",
    body: "Your comment goes back to Claude as feedback, so it can correct course instead of guessing.",
  },
  {
    icon: GitBranch,
    title: "A branch of its own, one click away",
    body: "A thread starts in your checkout. Move it into its own branch and git worktree whenever you want it out of your way.",
  },
]

export function WelcomeStep() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            The agent works. <span className="text-muted-foreground">You stay in charge.</span>
          </h1>
          <p className="max-w-prose text-muted-foreground">
            Humanity runs coding agents in threads. Claude does the work on its own, and you choose,
            thread by thread, whether it asks you before it changes a file or runs a command.
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

/** A still picture of a file change waiting for an answer, in a thread that asks first. */
function HunkPreview() {
  return (
    <figure
      aria-label="Example: in a thread that asks first, Claude proposes a change to src/app.ts and waits for your answer"
      className="w-full max-w-sm overflow-hidden rounded-xl border bg-card text-xs shadow-sm md:w-80"
    >
      <figcaption className="flex items-center gap-2 border-b px-3 py-2">
        <ClaudeMark className="size-4" />
        <span className="font-medium">Claude proposes</span>
        <code className="ml-auto text-muted-foreground">src/app.ts</code>
      </figcaption>
      <div className="font-mono leading-5" aria-hidden="true">
        <div className="px-3 text-muted-foreground">@@ -12,3 +12,3 @@</div>
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
          <Check className="size-3" /> Allow
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium">
          <X className="size-3" /> Deny with comment
        </span>
        <span className="ml-auto text-muted-foreground">waiting for you</span>
      </div>
    </figure>
  )
}
