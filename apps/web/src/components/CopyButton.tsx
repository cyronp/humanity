import { Check, Copy } from "lucide-react"
import { useCopy } from "@/lib/clipboard"
import { IconButton } from "@/components/IconButton"

export function CopyButton({
  text,
  label,
  className,
}: {
  readonly text: string
  readonly label: string
  readonly className?: string
}) {
  const { copied, copy } = useCopy()
  return (
    <IconButton
      variant="muted"
      size="icon-xs"
      className={className}
      label={copied ? "Copied" : label}
      onClick={() => void copy(text)}
    >
      {copied ? <Check /> : <Copy />}
    </IconButton>
  )
}
