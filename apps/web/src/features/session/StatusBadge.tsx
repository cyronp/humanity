import type { SessionStatus } from "@humanity/contracts"
import { cn } from "cn"
import { CircleAlert, CircleDot, CirclePause, CircleStop, Hand, LoaderCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

const STATUS = {
  idle: { label: "idle", Icon: CircleDot, className: "" },
  running: { label: "running", Icon: LoaderCircle, className: "[&>svg]:animate-spin" },
  waiting_for_human: {
    label: "waiting for you",
    Icon: Hand,
    className: "bg-amber-500 text-black hover:bg-amber-500 animate-pulse",
  },
  interrupted: { label: "interrupted", Icon: CirclePause, className: "" },
  error: { label: "error", Icon: CircleAlert, className: "" },
  ended: { label: "ended", Icon: CircleStop, className: "" },
} satisfies Record<SessionStatus, unknown>

export function StatusBadge({ status }: { readonly status: SessionStatus }) {
  const { label, Icon, className } = STATUS[status]
  return (
    <Badge
      variant={status === "error" ? "destructive" : status === "running" ? "default" : "secondary"}
      className={cn(className)}
      aria-live="polite"
    >
      <Icon />
      {label}
    </Badge>
  )
}
