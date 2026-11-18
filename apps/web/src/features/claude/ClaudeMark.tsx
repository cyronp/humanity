import { cn } from "cn"
import { ClaudeIcon } from "@/features/providers/ProviderIcon"

export function ClaudeMark({ className }: { readonly className?: string }) {
  return <ClaudeIcon aria-hidden="true" className={cn("size-6", className)} />
}
