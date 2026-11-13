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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PROVIDERS, type ProviderId } from "./ProviderIcon.tsx"

/** Where the new account's login lives: a folder made for it, or one the human already has. */
type Source = "new" | "folder"

/**
 * Adds another account to a provider. Either it starts signed out, with a
 * login of its own that its row then shows how to sign in, or it runs on a
 * config folder the human already signed in with (like `~/.claude-personal`).
 */
export function AddAccount({
  provider,
  onAdd,
}: {
  readonly provider: ProviderId
  /** Resolves to an error message, or `undefined` when the account was added. */
  readonly onAdd: (name: string, configDir?: string) => Promise<string | undefined>
}) {
  const { name: providerName, Icon } = PROVIDERS[provider]
  const nameId = useId()
  const folderId = useId()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<Source>("new")
  const [name, setName] = useState("")
  const [folder, setFolder] = useState("")
  const [error, setError] = useState<string>()
  const [adding, setAdding] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAdding(true)
    const failure = await onAdd(name, source === "folder" ? folder : undefined)
    setAdding(false)
    setError(failure)
    if (failure === undefined) {
      setOpen(false)
      setName("")
      setFolder("")
      setSource("new")
    }
  }

  const incomplete = name.trim() === "" || (source === "folder" && folder.trim() === "")

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
              For a second login, like work next to personal.
              {source === "new"
                ? ` It gets its own ${providerName} login on this computer; you sign in to it in the next step.`
                : ` It uses a ${providerName} folder you already signed in with, so there is nothing more to do.`}
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={source}
            onValueChange={(value) => {
              setSource(value === "folder" ? "folder" : "new")
              setError(undefined)
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="new">New login</TabsTrigger>
              <TabsTrigger value="folder">Existing folder</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={source === "new" ? "Work" : "Personal"}
              maxLength={60}
              autoComplete="off"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Shown in the list of accounts.</p>
          </div>
          {source === "folder" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={folderId}>{providerName} folder</Label>
              <Input
                id={folderId}
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                placeholder="~/.claude-personal"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                The folder you point <code>CLAUDE_CONFIG_DIR</code> at for this login. Threads run
                Claude Code with it, and removing the account leaves the folder alone.
              </p>
            </div>
          )}
          {error !== undefined && <ErrorNote title="Could not add the account" message={error} />}
          <DialogFooter>
            <Button type="submit" disabled={adding || incomplete}>
              Add account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
