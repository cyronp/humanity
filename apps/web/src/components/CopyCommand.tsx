import { cn } from "cn"
import { Check, Copy } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

export function CopyCommand({
  command,
  className,
}: {
  readonly command: string
  readonly className?: string
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = () => {
    void navigator.clipboard?.writeText(command).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border bg-muted/50 py-1 pr-1 pl-3 font-mono text-sm",
        className,
      )}
    >
      <span className="text-muted-foreground select-none" aria-hidden="true">
        $
      </span>
      <ScrollArea orientation="horizontal" className="min-w-0 flex-1">
        <code className="block py-1 whitespace-pre">{command}</code>
      </ScrollArea>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy "${command}"`}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}
