import { Plus } from "lucide-react"
import { type FormEvent, type ReactNode, useId, useState } from "react"
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

const FOLDERS: Record<ProviderId, { readonly variable: string; readonly example: string }> = {
  "claude-code": { variable: "CLAUDE_CONFIG_DIR", example: "~/.claude-personal" },
  codex: { variable: "CODEX_HOME", example: "~/.codex-work" },
  kiro: { variable: "KIRO_HOME", example: "~/.kiro-work" },
  antigravity: { variable: "GEMINI_HOME", example: "~/.gemini-work" },
}

type Source = "new" | "folder"

export function AddAccount({
  provider,
  onAdd,
}: {
  readonly provider: ProviderId
  readonly onAdd: (name: string, configDir?: string) => Promise<string | undefined>
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          Add account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <AddAccountForm provider={provider} onAdd={onAdd} onAdded={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

export function AddAccountForm({
  provider,
  onAdd,
  onAdded,
  picker,
}: {
  readonly provider: ProviderId
  readonly onAdd: (name: string, configDir?: string) => Promise<string | undefined>
  readonly onAdded: () => void
  readonly picker?: ReactNode
}) {
  const { name: providerName, Icon } = PROVIDERS[provider]
  const { variable, example } = FOLDERS[provider]
  const nameId = useId()
  const folderId = useId()
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
    if (failure === undefined) onAdded()
  }

  const incomplete = name.trim() === "" || (source === "folder" && folder.trim() === "")

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon className="size-4" aria-hidden="true" />
          Add a {providerName} account
        </DialogTitle>
        <DialogDescription>
          {source === "new"
            ? "You sign in to it in the next step."
            : `Use a ${providerName} folder that is already signed in.`}
        </DialogDescription>
      </DialogHeader>
      {picker}
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
            What you would set <code>{variable}</code> to.
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
  )
}
