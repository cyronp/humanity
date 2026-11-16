import { Check } from "lucide-react"
import { Children, type ReactNode } from "react"
import { Item, ItemActions, ItemContent, ItemFooter, ItemMedia } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"

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
    <Item asChild variant="outline" className="gap-x-3 gap-y-3 rounded-xl p-3">
      <li>
        <ItemMedia>{icon}</ItemMedia>
        <ItemContent className="min-w-0 gap-0">
          <span className="text-sm font-medium">{name}</span>
          {state === "connected" && detail !== undefined && (
            <span className="truncate text-xs text-muted-foreground">{detail}</span>
          )}
        </ItemContent>
        <ItemActions>
          {state === undefined ? (
            <Spinner className="text-muted-foreground" aria-label="Checking" />
          ) : state === "connected" ? (
            <span className="flex items-center gap-1 text-xs font-medium text-success">
              <Check className="size-3.5" aria-hidden="true" />
              Connected
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Not connected</span>
          )}
        </ItemActions>
        {/* Only when there is something to show: an empty footer would still take a row. */}
        {Children.toArray(children).length > 0 && (
          <ItemFooter className="flex-col items-stretch">{children}</ItemFooter>
        )}
      </li>
    </Item>
  )
}
