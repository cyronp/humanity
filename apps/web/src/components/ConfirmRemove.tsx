import { Trash2 } from "lucide-react"
import { type ReactElement, type ReactNode, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function ConfirmRemove({
  label,
  title,
  description,
  onConfirm,
  confirmLabel = "Remove",
  errorTitle = "Could not remove it",
  trigger,
  tooltip,
}: {
  readonly label: string
  readonly title: ReactNode
  readonly description: ReactNode
  readonly onConfirm: () => Promise<string | undefined>
  readonly confirmLabel?: string
  readonly errorTitle?: string
  readonly trigger?: ReactElement
  readonly tooltip?: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [removing, setRemoving] = useState(false)

  const confirm = async () => {
    setRemoving(true)
    const failure = await onConfirm()
    setRemoving(false)
    setError(failure)
    if (failure === undefined) setOpen(false)
  }

  const opener = (
    <AlertDialogTrigger asChild>
      {trigger ?? (
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <Trash2 />
        </Button>
      )}
    </AlertDialogTrigger>
  )
  const hint = trigger === undefined ? label : tooltip

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(undefined)
      }}
    >
      {hint === undefined ? (
        opener
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{opener}</TooltipTrigger>
          <TooltipContent>{hint}</TooltipContent>
        </Tooltip>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error !== undefined && <ErrorNote title={errorTitle} message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={() => void confirm()} disabled={removing}>
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
