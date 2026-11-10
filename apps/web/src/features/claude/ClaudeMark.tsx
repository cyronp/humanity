import { cn } from "cn"
import { ClaudeIcon } from "@/features/providers/ProviderIcon"

/** Claude's icon, decorative: the text next to it says what it stands for. */
export function ClaudeMark({ className }: { readonly className?: string }) {
  return <ClaudeIcon aria-hidden="true" className={cn("size-6", className)} />
}
