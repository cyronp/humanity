import { useAtomSet } from "@effect/atom-react"
import type { McpServer } from "@humanity/contracts"
import { Exit } from "effect"
import { ClipboardPaste, Pencil, Plus, Server, X } from "lucide-react"
import { type FormEvent, useId, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemFooter, ItemMedia } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { keys } from "@/lib/rpc"
import { ConfirmRemove } from "@/components/ConfirmRemove"
import { LabeledField } from "@/components/LabeledField"
import {
  importMcpServersAtom,
  removeMcpServerAtom,
  saveMcpServerAtom,
  setMcpServerEnabledAtom,
} from "./atoms.ts"
import {
  blankEntry,
  buildMcpInput,
  draftFromServer,
  EMPTY_DRAFT,
  type EntryDraft,
  type McpDraft,
  type TransportKind,
} from "./mcpForm.ts"
import { describeTransport, mcpMention, TRANSPORT_LABELS } from "./prompt.ts"
import { EMPTY_BOX, LIST_ROW, TAG } from "./styles.ts"
import { useAction } from "@/lib/useAction"
import { failureMessage } from "@/lib/errors"

const reactivityKeys = [keys.extensions]

type Editing =
  | { readonly kind: "new" }
  | { readonly kind: "edit"; readonly server: McpServer }
  | { readonly kind: "import" }

export function McpServersSettings({
  servers,
  repositoryName,
}: {
  readonly servers: ReadonlyArray<McpServer>
  readonly repositoryName: string | undefined
}) {
  const [editing, setEditing] = useState<Editing>()
  const own = servers.filter((server) => server.source === "humanity")
  const repository = servers.filter((server) => server.source === "project")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Available in every project.</p>
        <Button variant="outline" size="sm" onClick={() => setEditing({ kind: "import" })}>
          <ClipboardPaste />
          Paste JSON
        </Button>
        <Button size="sm" onClick={() => setEditing({ kind: "new" })}>
          <Plus />
          Add server
        </Button>
      </div>

      {editing?.kind === "import" && <ImportServers onDone={() => setEditing(undefined)} />}
      {editing?.kind === "new" && (
        <ServerEditor key="new" server={undefined} onDone={() => setEditing(undefined)} />
      )}

      {own.length === 0 && editing === undefined ? (
        <Empty className={EMPTY_BOX}>
          <EmptyDescription className="text-sm">No MCP servers yet.</EmptyDescription>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border empty:hidden">
          {own.map((server) =>
            editing?.kind === "edit" && editing.server.name === server.name ? (
              <li key={server.name} className="p-3">
                <ServerEditor server={server} onDone={() => setEditing(undefined)} />
              </li>
            ) : (
              <ServerRow
                key={server.name}
                server={server}
                onEdit={() => setEditing({ kind: "edit", server })}
              />
            ),
          )}
        </ul>
      )}

      {repository.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            From {repositoryName ?? "the repository"}'s{" "}
            <code className="font-mono text-xs">.mcp.json</code>
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {repository.map((server) => (
              <ServerRow key={server.name} server={server} onEdit={undefined} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ServerRow({
  server,
  onEdit,
}: {
  readonly server: McpServer
  readonly onEdit: (() => void) | undefined
}) {
  const { run: setEnabled, error } = useAction(setMcpServerEnabledAtom)
  const remove = useAtomSet(removeMcpServerAtom, { mode: "promiseExit" })
  const switchId = useId()
  const secrets =
    server.transport._tag === "stdio" ? server.transport.env : server.transport.headers

  const toggle = async (enabled: boolean) => {
    await setEnabled({ payload: { name: server.name, enabled }, reactivityKeys })
  }

  return (
    <Item asChild className={LIST_ROW}>
      <li>
        <ItemMedia variant="icon">
          <Server className="text-muted-foreground" aria-hidden="true" />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{server.name}</span>
            <Badge variant="secondary" className={TAG}>
              {TRANSPORT_LABELS[server.transport._tag]}
            </Badge>
            {!server.enabled && (
              <span className="text-xs text-muted-foreground">Off: the agent does not get it</span>
            )}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {describeTransport(server.transport)}
          </span>
          <span className="text-xs text-muted-foreground">
            Tools: <code className="font-mono">{mcpMention(server.name)}__…</code>
            {secrets.length > 0 &&
              ` · ${server.transport._tag === "stdio" ? "Variables" : "Headers"}: ${secrets.join(", ")}`}
          </span>
        </ItemContent>
        {onEdit !== undefined && (
          <ItemActions className="gap-1">
            <Label htmlFor={switchId} className="sr-only">
              Give {server.name} to the agent
            </Label>
            <Switch
              id={switchId}
              checked={server.enabled}
              onCheckedChange={(checked) => void toggle(checked)}
              className="mr-2"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${server.name}`}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <ConfirmRemove
              label={`Remove ${server.name}`}
              title={`Remove “${server.name}”?`}
              description="Its saved variables and headers are deleted too."
              onConfirm={async () => {
                const exit = await remove({ payload: { name: server.name }, reactivityKeys })
                return failureMessage(exit)
              }}
            />
          </ItemActions>
        )}
        {error !== undefined && (
          <ItemFooter>
            <ErrorNote title="Could not change the server" message={error} />
          </ItemFooter>
        )}
      </li>
    </Item>
  )
}

function ServerEditor({
  server,
  onDone,
}: {
  readonly server: McpServer | undefined
  readonly onDone: () => void
}) {
  const { run: save, error, setError, pending: saving } = useAction(saveMcpServerAtom)
  const [draft, setDraft] = useState<McpDraft>(() =>
    server === undefined ? EMPTY_DRAFT : draftFromServer(server),
  )
  const ids = useId()
  const update = (patch: Partial<McpDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const built = buildMcpInput(draft)
    if ("error" in built) {
      setError(built.error)
      return
    }
    const exit = await save({
      payload: { previousName: server?.name ?? null, ...built.ok },
      reactivityKeys,
    })
    if (Exit.isSuccess(exit)) onDone()
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4"
      aria-label={server === undefined ? "New MCP server" : `Edit ${server.name}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledField label="Name" htmlFor={`${ids}-name`}>
          <Input
            id={`${ids}-name`}
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder="github"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </LabeledField>
        <LabeledField label="Connection" htmlFor={`${ids}-transport`}>
          <Select
            value={draft.transport}
            onValueChange={(value) => update({ transport: value as TransportKind })}
          >
            <SelectTrigger id={`${ids}-transport`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">Local command (stdio)</SelectItem>
              <SelectItem value="http">Remote, HTTP</SelectItem>
              <SelectItem value="sse">Remote, server-sent events</SelectItem>
            </SelectContent>
          </Select>
        </LabeledField>
      </div>

      {draft.transport === "stdio" ? (
        <>
          <LabeledField label="Command" htmlFor={`${ids}-command`}>
            <Input
              id={`${ids}-command`}
              value={draft.command}
              onChange={(event) => update({ command: event.target.value })}
              placeholder="npx"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </LabeledField>
          <LabeledField label="Arguments" htmlFor={`${ids}-args`} hint="One per line.">
            <Textarea
              id={`${ids}-args`}
              value={draft.args}
              onChange={(event) => update({ args: event.target.value })}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem"}
              className="min-h-20 font-mono text-xs md:text-xs"
              spellCheck={false}
            />
          </LabeledField>
          <Entries
            title="Environment variables"
            namePlaceholder="API_TOKEN"
            entries={draft.env}
            onChange={(env) => update({ env })}
          />
        </>
      ) : (
        <>
          <LabeledField label="URL" htmlFor={`${ids}-url`}>
            <Input
              id={`${ids}-url`}
              value={draft.url}
              onChange={(event) => update({ url: event.target.value })}
              placeholder="https://example.com/mcp"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </LabeledField>
          <Entries
            title="Headers"
            namePlaceholder="Authorization"
            entries={draft.headers}
            onChange={(headers) => update({ headers })}
          />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Values like <code className="font-mono">{"${GITHUB_TOKEN}"}</code> are read from the
        daemon's environment.
      </p>
      {error !== undefined && <ErrorNote title="The server was not saved" message={error} />}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {server === undefined ? "Add server" : "Save"}
        </Button>
      </div>
    </form>
  )
}

function Entries({
  title,
  namePlaceholder,
  entries,
  onChange,
}: {
  readonly title: string
  readonly namePlaceholder: string
  readonly entries: ReadonlyArray<EntryDraft>
  readonly onChange: (entries: ReadonlyArray<EntryDraft>) => void
}) {
  const change = (id: number, patch: Partial<EntryDraft>) =>
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))

  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label" className="mb-2">
        {title}
      </FieldLegend>
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2">
          <Input
            value={entry.name}
            onChange={(event) => change(entry.id, { name: event.target.value, saved: false })}
            placeholder={namePlaceholder}
            aria-label={`${title}: name`}
            className="w-2/5 font-mono text-xs md:text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <Input
            type="password"
            value={entry.value}
            onChange={(event) => change(entry.id, { value: event.target.value })}
            placeholder={entry.saved ? "Saved. Leave empty to keep it" : "Value"}
            aria-label={`${title}: value of ${entry.name || "the new entry"}`}
            className="min-w-0 flex-1 font-mono text-xs md:text-xs"
            autoComplete="new-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${entry.name || "this row"}`}
            onClick={() => onChange(entries.filter((other) => other.id !== entry.id))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...entries, blankEntry()])}
      >
        <Plus />
        Add
      </Button>
    </FieldSet>
  )
}

const IMPORT_EXAMPLE = `{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer \${GITHUB_TOKEN}" }
    }
  }
}`

function ImportServers({ onDone }: { readonly onDone: () => void }) {
  const { run: importServers, error, pending: saving } = useAction(importMcpServersAtom)
  const [json, setJson] = useState("")
  const id = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const exit = await importServers({ payload: { json }, reactivityKeys })
    if (Exit.isSuccess(exit)) onDone()
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4"
    >
      <LabeledField
        label="Configuration"
        htmlFor={id}
        hint={`The JSON from the server's docs, with "mcpServers" or without.`}
      >
        <Textarea
          id={id}
          value={json}
          onChange={(event) => setJson(event.target.value)}
          placeholder={IMPORT_EXAMPLE}
          className="min-h-44 font-mono text-xs md:text-xs"
          spellCheck={false}
          autoFocus
        />
      </LabeledField>
      {error !== undefined && <ErrorNote title="Nothing was added" message={error} />}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || json.trim() === ""}>
          Add servers
        </Button>
      </div>
    </form>
  )
}
