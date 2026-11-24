import { cn } from "cn"
import type { ReactNode } from "react"

export function WaitingDot() {
  return (
    <span className="relative flex size-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex size-full rounded-full bg-warning opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex size-2 rounded-full bg-warning" />
    </span>
  )
}

export function DecisionCard({
  label,
  kind,
  title,
  aside,
  children,
  footer,
  className,
  ...rest
}: {
  readonly label: string
  readonly kind: ReactNode
  readonly title: ReactNode
  readonly aside?: ReactNode
  readonly children?: ReactNode
  readonly footer: ReactNode
  readonly className?: string
  readonly "data-change-id"?: string
}) {
  return (
    <section
      role="alertdialog"
      aria-label={label}
      className={cn(
        "overflow-hidden rounded-xl border border-warning/35 bg-card text-card-foreground shadow-sm ring-4 ring-warning/8",
        className,
      )}
      {...rest}
    >
      <header className="flex items-start gap-3 px-4 pt-3 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <WaitingDot />
            <span className="font-medium text-warning">Waiting for you</span>
            <span aria-hidden className="text-muted-foreground/50">
              ·
            </span>
            {kind}
          </p>
          <div className="min-w-0">{title}</div>
        </div>
        {aside !== undefined && <div className="shrink-0 pt-5">{aside}</div>}
      </header>
      {children}
      <footer className="flex flex-col gap-2 border-t bg-muted/30 px-3 py-2.5">{footer}</footer>
    </section>
  )
}
