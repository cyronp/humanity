import { cn } from "cn"
import type { ReactNode } from "react"

export function PanelEmpty({
  className,
  children,
}: {
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <div className={cn("py-8 text-center text-sm text-muted-foreground", className)}>
      {children}
    </div>
  )
}
