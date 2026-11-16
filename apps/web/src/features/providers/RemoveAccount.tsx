import { Trash2 } from "lucide-react"
import { useState } from "react"
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
import { PROVIDERS, type ProviderId } from "./ProviderIcon.tsx"

/** Asks before removing an added account of a provider: its login goes with it. */
export function RemoveAccount({
  provider,
  account,
  folder,
  onRemove,
}: {
  readonly provider: ProviderId
  readonly account: {
    readonly id: string
    readonly name: string
    readonly linkedFolder: boolean
  }
  /** Where the account's login lives. */
  readonly folder: string | null
  /** Resolves to an error message, or `undefined` when the account was removed. */
  readonly onRemove: (accountId: string) => Promise<string | undefined>
}) {
  const { name: providerName, vendor } = PROVIDERS[provider]
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [removing, setRemoving] = useState(false)

  const confirm = async () => {
    setRemoving(true)
    const failure = await onRemove(account.id)
    setRemoving(false)
    setError(failure)
    if (failure === undefined) setOpen(false)
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
            <Button variant="muted" size="icon-sm" aria-label={`Remove account “${account.name}”`}>
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Remove account</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{account.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {account.linkedFolder ? (
              <>
                Humanity stops using it. Its folder
                {folder !== null && (
                  <>
                    {" "}
                    <code className="break-all">{folder}</code>
                  </>
                )}{" "}
                stays as it is, with its login and conversations.
              </>
            ) : (
              `Its login and the conversations ${providerName} kept for it are deleted from this computer.`
            )}{" "}
            Ended threads that ran as it stay readable. The {vendor} account itself is not touched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== undefined && <ErrorNote title="Could not remove the account" message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={() => void confirm()} disabled={removing}>
            Remove account
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
