import { cn } from "cn"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useCopy } from "@/lib/clipboard"

export function CopyCommand({
  command,
  className,
}: {
  readonly command: string
  readonly className?: string
}) {
  const { copied, copy } = useCopy()

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
        onClick={() => void copy(command)}
        aria-label={copied ? "Copied" : `Copy "${command}"`}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}
