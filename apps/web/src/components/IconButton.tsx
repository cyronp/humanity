import type { ComponentProps, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function IconButton({
  label,
  tooltip,
  side,
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-label" | "title"> & {
  readonly label: string
  readonly tooltip?: ReactNode
  readonly side?: ComponentProps<typeof TooltipContent>["side"]
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent side={side}>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  )
}
