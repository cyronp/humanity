import type { SessionStatus } from "@humanity/contracts"
import { CircleAlert, CircleDot, CirclePause, CircleStop, Hand, LoaderCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { STATUS_TONE } from "./statusTone.ts"

const STATUS = {
  idle: { label: "idle", Icon: CircleDot, className: "" },
  running: { label: "running", Icon: LoaderCircle, className: "[&>svg]:animate-spin" },
  waiting_for_human: { label: "waiting for you", Icon: Hand, className: "animate-pulse" },
  interrupted: { label: "interrupted", Icon: CirclePause, className: "" },
  error: { label: "error", Icon: CircleAlert, className: "" },
  ended: { label: "ended", Icon: CircleStop, className: "" },
} satisfies Record<SessionStatus, unknown>

const variantOf = (status: SessionStatus) => {
  const tone = STATUS_TONE[status]
  if (tone === "warning" || tone === "destructive") return tone
  return status === "running" ? "default" : "secondary"
}

export function StatusBadge({ status }: { readonly status: SessionStatus }) {
  const { label, Icon, className } = STATUS[status]
  return (
    <Badge variant={variantOf(status)} className={className} aria-live="polite">
      <Icon />
      {label}
    </Badge>
  )
}
