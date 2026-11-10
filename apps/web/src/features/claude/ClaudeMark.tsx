import { cn } from "cn"
import { Sparkle } from "lucide-react"
import { useState } from "react"

/**
 * Claude's icon, served from `apps/web/public/claude.svg`. Until that file
 * exists (or if it fails to load) a neutral sparkle in Claude's accent colour
 * stands in, so the layout never shows a broken image.
 */
export const CLAUDE_ICON_SRC = "/claude.svg"

export function ClaudeMark({ className }: { readonly className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-[28%] bg-claude text-white",
          className,
        )}
      >
        <Sparkle className="size-[60%]" />
      </span>
    )
  }
  return (
    <img
      src={CLAUDE_ICON_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("size-6 shrink-0 object-contain", className)}
    />
  )
}
