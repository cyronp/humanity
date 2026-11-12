import { Plus } from "lucide-react"
import { type FormEvent, useId, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PROVIDERS, type ProviderId } from "./ProviderIcon.tsx"

/**
 * Adds another account to a provider. The account starts signed out, with a
 * login of its own; its row then shows how to sign it in.
 */
export function AddAccount({
  provider,
  onAdd,
}: {
  readonly provider: ProviderId
  /** Resolves to an error message, or `undefined` when the account was added. */
  readonly onAdd: (name: string) => Promise<string | undefined>
}) {
  const { name: providerName, Icon } = PROVIDERS[provider]
  const nameId = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string>()
  const [adding, setAdding] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAdding(true)
    const failure = await onAdd(name)
    setAdding(false)
    setError(failure)
    if (failure === undefined) {
      setOpen(false)
      setName("")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(undefined)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          Add account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className="size-4" aria-hidden="true" />
              Add a {providerName} account
            </DialogTitle>
            <DialogDescription>
              For a second login, like work next to personal. It gets its own {providerName} login
              on this computer; you sign in to it in the next step.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Work"
              maxLength={60}
              autoComplete="off"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Shown in the list of accounts.</p>
          </div>
          {error !== undefined && <ErrorNote title="Could not add the account" message={error} />}
          <DialogFooter>
            <Button type="submit" disabled={adding || name.trim() === ""}>
              Add account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
