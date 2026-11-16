import { Plus } from "lucide-react"
import { type FormEvent, useId, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PROVIDERS, type ProviderId } from "./ProviderIcon.tsx"

/** What a provider calls the folder its login lives in, and what a second one could be named. */
const FOLDERS: Record<ProviderId, { readonly variable: string; readonly example: string }> = {
  "claude-code": { variable: "CLAUDE_CONFIG_DIR", example: "~/.claude-personal" },
  codex: { variable: "CODEX_HOME", example: "~/.codex-work" },
}

/** Where the new account's login lives: a folder made for it, or one the human already has. */
type Source = "new" | "folder"

/**
 * Adds another account to a provider. Either it starts signed out, with a
 * login of its own that its row then shows how to sign in, or it runs on a
 * config folder the human already signed in with (like `~/.claude-personal`
 * or `~/.codex-work`).
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
  const { variable, example } = FOLDERS[provider]
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
              For a second login,
              {source === "new"
                ? ` it gets its own ${providerName} login on this computer; you sign in to it in the next step.`
                : ` it uses a ${providerName} folder you already signed in with, so there is nothing more to do.`}
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
          <Field className="gap-2">
            <FieldLabel htmlFor={nameId}>Name</FieldLabel>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={source === "new" ? "Work" : "Personal"}
              maxLength={60}
              autoComplete="off"
              autoFocus
            />
            <FieldDescription>Shown in the list of accounts.</FieldDescription>
          </Field>
          {source === "folder" && (
            <Field className="gap-2">
              <FieldLabel htmlFor={folderId}>{providerName} folder</FieldLabel>
              <Input
                id={folderId}
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                placeholder={example}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <FieldDescription>
                The folder you point <code>{variable}</code> at for this login. Threads run{" "}
                {providerName} with it, and removing the account leaves the folder alone.
              </FieldDescription>
            </Field>
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
