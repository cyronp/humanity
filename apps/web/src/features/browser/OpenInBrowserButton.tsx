import { isPreviewFile, type SessionId } from "@humanity/contracts"
import { Exit } from "effect"
import { Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fileUrlAtom } from "./atoms.ts"
import { requestPreview } from "./browser.ts"
import { useAction } from "@/lib/useAction"

export function OpenInBrowserButton({
  sessionId,
  path,
  labeled = false,
}: {
  readonly sessionId: SessionId
  readonly path: string
  readonly labeled?: boolean
}) {
  const { run: fileUrl, error } = useAction(fileUrlAtom)
  if (!isPreviewFile(path)) return null

  const open = async () => {
    const exit = await fileUrl({ payload: { sessionId, path } })
    if (Exit.isFailure(exit)) return
    if (!requestPreview(exit.value, { explicit: true }))
      window.open(exit.value, "_blank", "noopener,noreferrer")
  }

  if (labeled) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button variant="outline" size="xs" onClick={() => void open()}>
          <Globe />
          Open in the Browser
        </Button>
        {error !== undefined && <p className="text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={(event) => {
        event.stopPropagation()
        void open()
      }}
      aria-label="Open in the Browser"
      title={error ?? "Open in the Browser"}
      className={error === undefined ? "text-muted-foreground" : "text-destructive"}
    >
      <Globe />
    </Button>
  )
}
