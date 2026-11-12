import type { ReactNode } from "react"

/** One step of a short how-to, inside an `<ol>`: its number, a title and what to do. */
export function NumberedStep({
  n,
  title,
  children,
}: {
  readonly n: number
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3">
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}
