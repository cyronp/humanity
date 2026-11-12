import { useAtomSet } from "@effect/atom-react"
import type { McpServer } from "@humanity/contracts"
import { Exit } from "effect"
import { ClipboardPaste, Pencil, Plus, Server, X } from "lucide-react"
import { type FormEvent, type ReactNode, useId, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import {
  importMcpServersAtom,
  removeMcpServerAtom,
  saveMcpServerAtom,
  setMcpServerEnabledAtom,
} from "./atoms.ts"
import { ConfirmRemove } from "./ConfirmRemove.tsx"
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

const reactivityKeys = [keys.extensions]

type Editing =
  | { readonly kind: "new" }
  | { readonly kind: "edit"; readonly server: McpServer }
  | { readonly kind: "import" }

/** Humanity's own MCP servers, editable, then the repository's, read-only. */
export function McpServersSettings({
  servers,
  repositoryName,
}: {
  readonly servers: ReadonlyArray<McpServer>
  /** The project whose repository's servers are listed, if one is open. */
  readonly repositoryName: string | undefined
}) {
  const [editing, setEditing] = useState<Editing>()
  const own = servers.filter((server) => server.source === "humanity")
  const repository = servers.filter((server) => server.source === "project")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Servers added here reach every project. Each tool call still asks you first, unless the
          project's policy allows <code className="font-mono text-xs">mcp__*</code> tools.
        </p>
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
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No MCP servers yet. Add one, or paste the JSON configuration from a server's docs.
        </p>
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
  /** `undefined` for a repository's server, which is changed in the repository. */
  readonly onEdit: (() => void) | undefined
}) {
  const setEnabled = useAtomSet(setMcpServerEnabledAtom, { mode: "promiseExit" })
  const remove = useAtomSet(removeMcpServerAtom, { mode: "promiseExit" })
  const [error, setError] = useState<string>()
  const switchId = useId()
  const secrets =
    server.transport._tag === "stdio" ? server.transport.env : server.transport.headers

  const toggle = async (enabled: boolean) => {
    setError(undefined)
    const exit = await setEnabled({ payload: { name: server.name, enabled }, reactivityKeys })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <Server className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{server.name}</span>
            <span className="rounded-sm bg-muted px-1.5 text-[0.7rem] text-muted-foreground">
              {TRANSPORT_LABELS[server.transport._tag]}
            </span>
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
        </div>
        {onEdit !== undefined && (
          <div className="flex shrink-0 items-center gap-1">
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
              description="The agent no longer gets this server, from its next message on. Its saved variables and headers are deleted."
              onConfirm={async () => {
                const exit = await remove({ payload: { name: server.name }, reactivityKeys })
                return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
              }}
            />
          </div>
        )}
      </div>
      {error !== undefined && <ErrorNote title="Could not change the server" message={error} />}
    </li>
  )
}

function ServerEditor({
  server,
  onDone,
}: {
  /** `undefined` adds a new server. */
  readonly server: McpServer | undefined
  readonly onDone: () => void
}) {
  const save = useAtomSet(saveMcpServerAtom, { mode: "promiseExit" })
  const [draft, setDraft] = useState<McpDraft>(() =>
    server === undefined ? EMPTY_DRAFT : draftFromServer(server),
  )
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const ids = useId()
  const update = (patch: Partial<McpDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const built = buildMcpInput(draft)
    if ("error" in built) {
      setError(built.error)
      return
    }
    setSaving(true)
    setError(undefined)
    const exit = await save({
      payload: { previousName: server?.name ?? null, ...built.ok },
      reactivityKeys,
    })
    setSaving(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
    else onDone()
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4"
      aria-label={server === undefined ? "New MCP server" : `Edit ${server.name}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`${ids}-name`} hint="Its tools are named mcp__<name>__<tool>.">
          <Input
            id={`${ids}-name`}
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder="github"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Connection" htmlFor={`${ids}-transport`}>
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
        </Field>
      </div>

      {draft.transport === "stdio" ? (
        <>
          <Field label="Command" htmlFor={`${ids}-command`}>
            <Input
              id={`${ids}-command`}
              value={draft.command}
              onChange={(event) => update({ command: event.target.value })}
              placeholder="npx"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Arguments" htmlFor={`${ids}-args`} hint="One per line.">
            <Textarea
              id={`${ids}-args`}
              value={draft.args}
              onChange={(event) => update({ args: event.target.value })}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem"}
              className="min-h-20 font-mono text-xs md:text-xs"
              spellCheck={false}
            />
          </Field>
          <Entries
            title="Environment variables"
            namePlaceholder="API_TOKEN"
            entries={draft.env}
            onChange={(env) => update({ env })}
          />
        </>
      ) : (
        <>
          <Field label="URL" htmlFor={`${ids}-url`}>
            <Input
              id={`${ids}-url`}
              value={draft.url}
              onChange={(event) => update({ url: event.target.value })}
              placeholder="https://example.com/mcp"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Entries
            title="Headers"
            namePlaceholder="Authorization"
            entries={draft.headers}
            onChange={(headers) => update({ headers })}
          />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Saved in Humanity's data folder (<code className="font-mono">mcp.json</code>), never in its
        database. Values like <code className="font-mono">{"${GITHUB_TOKEN}"}</code> are read from
        the daemon's environment when the agent starts.
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

/** Environment variables or headers: a name and a hidden value per row. */
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
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{title}</legend>
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2">
          <Input
            value={entry.name}
            // A saved value belongs to its name; renaming one means entering it again.
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
    </fieldset>
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

/** Adds the servers of a configuration copied from a server's docs or another app. */
function ImportServers({ onDone }: { readonly onDone: () => void }) {
  const importServers = useAtomSet(importMcpServersAtom, { mode: "promiseExit" })
  const [json, setJson] = useState("")
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const id = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    const exit = await importServers({ payload: { json }, reactivityKeys })
    setSaving(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
    else onDone()
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4"
    >
      <Field
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
      </Field>
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

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  readonly label: string
  readonly htmlFor: string
  readonly hint?: string
  readonly children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
