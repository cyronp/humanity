import { useAtomSet } from "@effect/atom-react"
import { AgentProvider, PROVIDER_NAMES, type Skill } from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { Pencil, Plus, Sparkles } from "lucide-react"
import { type FormEvent, type ReactNode, useId, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item"
import { Textarea } from "@/components/ui/textarea"
import { keys } from "@/lib/rpc"
import { ConfirmRemove } from "@/components/ConfirmRemove"
import { LabeledField } from "@/components/LabeledField"
import { removeSkillAtom, saveSkillAtom } from "./atoms.ts"
import { checkSkill, skillSlug } from "./mcpForm.ts"
import { EMPTY_BOX, LIST_ROW, TAG } from "./styles.ts"
import { useAction } from "@/lib/useAction"
import { failureMessage } from "@/lib/errors"

const reactivityKeys = [keys.extensions]

const INSTRUCTIONS_PLACEHOLDER = `# Reviewing SQL

1. Read every query the change touches.
2. Flag joins without an index and unbounded selects.
3. Suggest the fix; never edit migrations that already ran.`

type Editing = { readonly kind: "new" } | { readonly kind: "edit"; readonly skill: Skill }

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
  const personal = skills.filter((skill) => skill.source === "user")

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

      {groupByLocation(repository).map(([location, skills]) => (
        <SkillGroup
          key={`project:${location}`}
          heading={
            <>
              From {repositoryName ?? "the repository"}'s{" "}
              <code className="font-mono text-xs">{location}</code>
            </>
          }
          skills={skills}
        />
      ))}

      {personal.length > 0 && (
        <div className="flex flex-col gap-3 pt-2">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">From your agents</h3>
            <p className="text-sm text-muted-foreground">
              Found in the folders of the CLIs on this computer, read where they are. Each agent
              gets the ones it doesn't load itself, while Skills is on in Agent → Tools.
            </p>
          </div>
          {groupByLocation(personal).map(([location, skills]) => (
            <SkillGroup
              key={`user:${location}`}
              heading={
                location.startsWith("~") || location.startsWith("/") ? (
                  <code className="font-mono text-xs">{location}</code>
                ) : (
                  location
                )
              }
              skills={skills}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const groupByLocation = (
  skills: ReadonlyArray<Skill>,
): ReadonlyArray<readonly [string, ReadonlyArray<Skill>]> => {
  const groups = new Map<string, Array<Skill>>()
  for (const skill of skills) {
    const group = groups.get(skill.location)
    if (group === undefined) groups.set(skill.location, [skill])
    else group.push(skill)
  }
  return [...groups]
}

function SkillGroup({
  heading,
  skills,
}: {
  readonly heading: ReactNode
  readonly skills: ReadonlyArray<Skill>
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{heading}</h4>
      <ul className="flex flex-col divide-y rounded-lg border">
        {skills.map((skill) => (
          <SkillRow key={skill.name} skill={skill} onEdit={undefined} />
        ))}
      </ul>
    </div>
  )
}

const listNames = (providers: ReadonlyArray<AgentProvider>): string => {
  const names = providers.map((provider) => PROVIDER_NAMES[provider])
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

const sharing = (skill: Skill): string => {
  const others = AgentProvider.literals.filter((provider) => !skill.nativeTo.includes(provider))
  if (others.length === 0) return `Every agent reads it itself.`
  if (skill.nativeTo.length === 0) return `Humanity gives it to ${listNames(others)}.`
  return `${listNames(skill.nativeTo)} ${skill.nativeTo.length === 1 ? "reads" : "read"} it itself; Humanity gives it to ${listNames(others)}.`
}

function SkillRow({
  skill,
  onEdit,
}: {
  readonly skill: Skill
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
            {skill.invocation.startsWith("/") && (
              <Badge asChild variant="secondary" className={cn(TAG, "font-mono")}>
                <code>{skill.invocation}</code>
              </Badge>
            )}
          </span>
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {skill.description === "" ? "No description." : skill.description}
          </span>
          <span className="text-xs text-muted-foreground/80">{sharing(skill)}</span>
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
                return failureMessage(exit)
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
  readonly skill: Skill | undefined
  readonly onDone: () => void
}) {
  const { run: save, error, setError, pending: saving } = useAction(saveSkillAtom)
  const [name, setName] = useState(skill?.name ?? "")
  const [description, setDescription] = useState(skill?.description ?? "")
  const [instructions, setInstructions] = useState(skill?.instructions ?? "")
  const ids = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const checked = checkSkill({ name, description, instructions })
    if ("error" in checked) {
      setError(checked.error)
      return
    }
    const exit = await save({
      payload: { previousName: skill?.name ?? null, skill: checked.ok },
      reactivityKeys,
    })
    if (Exit.isSuccess(exit)) onDone()
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4"
      aria-label={skill === undefined ? "New skill" : `Edit ${skill.name}`}
    >
      <LabeledField
        label="Name"
        htmlFor={`${ids}-name`}
        hint={`Start a message with /humanity:${skillSlug(name) || "<name>"} to use it.`}
      >
        <Input
          id={`${ids}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setName((current) => skillSlug(current))}
          placeholder="review-sql"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </LabeledField>
      <LabeledField
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
      </LabeledField>
      <LabeledField label="Instructions" htmlFor={`${ids}-instructions`} hint="Markdown.">
        <Textarea
          id={`${ids}-instructions`}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder={INSTRUCTIONS_PLACEHOLDER}
          className="max-h-96 min-h-48 font-mono text-xs md:text-xs"
        />
      </LabeledField>
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
