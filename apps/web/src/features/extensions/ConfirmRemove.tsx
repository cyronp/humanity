import { Trash2 } from "lucide-react"
import { type ReactNode, useState } from "react"
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

/** A trash button that asks first; `onConfirm` resolves to an error message, or `undefined` once removed. */
export function ConfirmRemove({
  label,
  title,
  description,
  onConfirm,
}: {
  /** The button's accessible name, e.g. "Remove github". */
  readonly label: string
  readonly title: string
  readonly description: ReactNode
  readonly onConfirm: () => Promise<string | undefined>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [removing, setRemoving] = useState(false)

  const confirm = async () => {
    setRemoving(true)
    const failure = await onConfirm()
    setRemoving(false)
    if (failure !== undefined) setError(failure)
    else setOpen(false)
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(undefined)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={label}>
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error !== undefined && <ErrorNote title="Could not remove it" message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {/* Not AlertDialogAction: that closes at once, and a failure must stay in view. */}
          <Button variant="destructive" onClick={() => void confirm()} disabled={removing}>
            Remove
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
