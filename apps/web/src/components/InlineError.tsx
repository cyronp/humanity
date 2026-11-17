import { cn } from "cn"
import type { ComponentProps } from "react"
import { FieldError } from "@/components/ui/field"

export function InlineError({ className, ...props }: ComponentProps<typeof FieldError>) {
  return <FieldError className={cn("text-xs whitespace-pre-wrap", className)} {...props} />
}
