import { cn } from "cn"
import { Check, LoaderCircle } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

/** The guide's main actions are blue, like the brand mark. */
export const BLUE_BUTTON = "bg-blue-600 text-white hover:bg-blue-700"

/** `undefined` while it is still being looked up. */
export type ServiceState = "connected" | "disconnected" | undefined

/**
 * One thing the guide connects to: its icon and name, whether it is connected
 * and, below, whatever helps when it is not.
 */
export function ServiceRow({
  icon,
  name,
  state,
  detail,
  children,
}: {
  readonly icon: ReactNode
  readonly name: string
  readonly state: ServiceState
  /** Who it is connected as and how; shown only when connected. */
  readonly detail?: string
  readonly children?: ReactNode
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-center gap-3">
        {icon}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">{name}</span>
          {state === "connected" && detail !== undefined && (
            <span className="truncate text-xs text-muted-foreground">{detail}</span>
          )}
        </div>
        {state === undefined ? (
          <LoaderCircle
            className="size-4 animate-spin text-muted-foreground"
            aria-label="Checking"
          />
        ) : state === "connected" ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" aria-hidden="true" />
            Connected
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not connected</span>
        )}
      </div>
      {children}
    </li>
  )
}

/** A small blue line of text that is a button. */
export function TextButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "self-start rounded-sm text-xs font-medium text-blue-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-blue-400",
        className,
      )}
      {...props}
    />
  )
}
