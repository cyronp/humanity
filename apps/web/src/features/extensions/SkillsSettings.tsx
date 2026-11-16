import { useAtomSet } from "@effect/atom-react"
import type { Skill } from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { Pencil, Plus, Sparkles } from "lucide-react"
import { type FormEvent, useId, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item"
import { Textarea } from "@/components/ui/textarea"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { removeSkillAtom, saveSkillAtom } from "./atoms.ts"
import { ConfirmRemove } from "./ConfirmRemove.tsx"
import { Field } from "./McpServersSettings.tsx"
import { checkSkill, skillSlug } from "./mcpForm.ts"
import { EMPTY_BOX, LIST_ROW, TAG } from "./styles.ts"

const reactivityKeys = [keys.extensions]

const INSTRUCTIONS_PLACEHOLDER = `# Reviewing SQL

1. Read every query the change touches.
2. Flag joins without an index and unbounded selects.
3. Suggest the fix; never edit migrations that already ran.`

type Editing = { readonly kind: "new" } | { readonly kind: "edit"; readonly skill: Skill }

/** Humanity's own skills, editable, then the repository's, read-only. */
export function SkillsSettings({
  skills,
  repositoryName,
}: {
  readonly skills: ReadonlyArray<Skill>
  readonly repositoryName: string | undefined
}) {
  const [editing, setEditing] = useState<Editing>()
  const own = skills.filter((skill) => skill.source === "humanity")
  const repository = skills.filter((skill) => skill.source === "project")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Available in every project.</p>
        <Button size="sm" onClick={() => setEditing({ kind: "new" })}>
          <Plus />
          Add skill
        </Button>
      </div>

      {editing?.kind === "new" && (
        <SkillEditor key="new" skill={undefined} onDone={() => setEditing(undefined)} />
      )}

      {own.length === 0 && editing === undefined ? (
        <Empty className={EMPTY_BOX}>
          <EmptyDescription className="text-sm">No skills yet.</EmptyDescription>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border empty:hidden">
          {own.map((skill) =>
            editing?.kind === "edit" && editing.skill.name === skill.name ? (
              <li key={skill.name} className="p-3">
                <SkillEditor skill={skill} onDone={() => setEditing(undefined)} />
              </li>
            ) : (
              <SkillRow
                key={skill.name}
                skill={skill}
                onEdit={() => setEditing({ kind: "edit", skill })}
              />
            ),
          )}
        </ul>
      )}

      {repository.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            From {repositoryName ?? "the repository"}'s{" "}
            <code className="font-mono text-xs">.claude/skills</code>
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {repository.map((skill) => (
              <SkillRow key={skill.name} skill={skill} onEdit={undefined} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function SkillRow({
  skill,
  onEdit,
}: {
  readonly skill: Skill
  /** `undefined` for a repository's skill, which is changed in the repository. */
  readonly onEdit: (() => void) | undefined
}) {
  const remove = useAtomSet(removeSkillAtom, { mode: "promiseExit" })
  return (
    <Item asChild className={LIST_ROW}>
      <li>
        <ItemMedia variant="icon">
          <Sparkles className="text-muted-foreground" aria-hidden="true" />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{skill.name}</span>
            <Badge asChild variant="secondary" className={cn(TAG, "font-mono")}>
              <code>{skill.invocation}</code>
            </Badge>
          </span>
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {skill.description === "" ? "No description." : skill.description}
          </span>
        </ItemContent>
        {onEdit !== undefined && (
          <ItemActions className="gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${skill.name}`}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <ConfirmRemove
              label={`Remove ${skill.name}`}
              title={`Remove “${skill.name}”?`}
              description="Its files are deleted."
              onConfirm={async () => {
                const exit = await remove({ payload: { name: skill.name }, reactivityKeys })
                return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
              }}
            />
          </ItemActions>
        )}
      </li>
    </Item>
  )
}

function SkillEditor({
  skill,
  onDone,
}: {
  /** `undefined` adds a new skill. */
  readonly skill: Skill | undefined
  readonly onDone: () => void
}) {
  const save = useAtomSet(saveSkillAtom, { mode: "promiseExit" })
  const [name, setName] = useState(skill?.name ?? "")
  const [description, setDescription] = useState(skill?.description ?? "")
  const [instructions, setInstructions] = useState(skill?.instructions ?? "")
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const ids = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const checked = checkSkill({ name, description, instructions })
    if ("error" in checked) {
      setError(checked.error)
      return
    }
    setSaving(true)
    setError(undefined)
    const exit = await save({
      payload: { previousName: skill?.name ?? null, skill: checked.ok },
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
      aria-label={skill === undefined ? "New skill" : `Edit ${skill.name}`}
    >
      <Field
        label="Name"
        htmlFor={`${ids}-name`}
        hint={`Start a message with /humanity:${skillSlug(name) || "<name>"} to use it.`}
      >
        <Input
          id={`${ids}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          // Lowercase words joined by hyphens, as the agent's skill names must be.
          onBlur={() => setName((current) => skillSlug(current))}
          placeholder="review-sql"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </Field>
      <Field
        label="Description"
        htmlFor={`${ids}-description`}
        hint="What it does and when to use it."
      >
        <Input
          id={`${ids}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Reviews SQL queries for missing indexes. Use when a change touches SQL."
          autoComplete="off"
        />
      </Field>
      <Field label="Instructions" htmlFor={`${ids}-instructions`} hint="Markdown.">
        <Textarea
          id={`${ids}-instructions`}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder={INSTRUCTIONS_PLACEHOLDER}
          className="max-h-96 min-h-48 font-mono text-xs md:text-xs"
        />
      </Field>
      {error !== undefined && <ErrorNote title="The skill was not saved" message={error} />}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {skill === undefined ? "Add skill" : "Save"}
        </Button>
      </div>
    </form>
  )
}
