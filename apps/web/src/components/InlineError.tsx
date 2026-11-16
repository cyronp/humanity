import { cn } from "cn"
import type { ComponentProps } from "react"
import { FieldError } from "@/components/ui/field"

/**
 * A failure told in one line, next to what failed: under a form, in a menu,
 * in place of a list that did not load. It is shadcn's `FieldError` in the
 * app's small text; `ErrorNote` is the boxed version.
 */
export function InlineError({ className, ...props }: ComponentProps<typeof FieldError>) {
  return <FieldError className={cn("text-xs whitespace-pre-wrap", className)} {...props} />
}
