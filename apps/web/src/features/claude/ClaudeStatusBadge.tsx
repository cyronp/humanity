import { Link } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ClaudeMark } from "./ClaudeMark.tsx"
import { summarizeClaude } from "./summary.ts"
import { ToneDot } from "./ToneDot.tsx"
import { useClaudeStatus } from "./useClaudeStatus.ts"

/** Header pill: which Claude account the agent runs as. Opens the connection step. */
export function ClaudeStatusBadge() {
  const { result } = useClaudeStatus()

  const view = AsyncResult.match(result, {
    onInitial: () => ({
      tone: "pending" as const,
      short: "Checking Claude…",
      detail: "Starting Claude Code to read its login.",
    }),
    onFailure: () => ({
      tone: "error" as const,
      short: "Claude unknown",
      detail: "Could not ask the daemon about Claude.",
    }),
    onSuccess: ({ value }) => {
      const summary = summarizeClaude(value)
      const connection = value.connection
      const who =
        connection._tag === "Connected" && connection.email !== null
          ? ` as ${connection.email}`
          : ""
      return { tone: summary.tone, short: summary.short, detail: `${summary.title}${who}.` }
    },
  })

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/welcome"
          search={{ step: "connect" }}
          className="flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          <ClaudeMark className="size-4" />
          <span className="max-w-40 truncate">{view.short}</span>
          <ToneDot tone={view.tone} />
          <span className="sr-only">{view.detail}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent>{view.detail}</TooltipContent>
    </Tooltip>
  )
}
