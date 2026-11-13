import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"

export function ConnectOption({
  title,
  description,
  inUse,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly inUse: boolean
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">{title}</h4>
          {inUse && <Badge>In use</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}
