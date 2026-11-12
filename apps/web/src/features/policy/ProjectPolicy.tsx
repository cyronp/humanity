import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  FALLBACK_TOOL_MODE,
  type Project,
  type ToolMode,
  type ToolPolicy,
  type ToolRule,
} from "@humanity/contracts"
import { Exit } from "effect"
import { Plus, Save, Trash2 } from "lucide-react"
import { type FormEvent, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { policyAtom, setPolicyAtom } from "./atoms.ts"

const MODES: ReadonlyArray<{ readonly value: ToolMode; readonly label: string }> = [
  { value: "auto", label: "auto: runs without asking" },
  { value: "review", label: "review: hunk by hunk" },
  { value: "confirm", label: "confirm: allow or deny" },
  { value: "deny", label: "deny: never runs" },
]

/** A project's tool policy: which tools run by themselves, get reviewed, ask first or never run. */
export function ProjectPolicy({ project }: { readonly project: Project }) {
  const policy = useAtomValue(policyAtom(project.id))
  return (
    <section aria-labelledby="project-policy" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="project-policy" className="font-medium">
          Tool policy
        </h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          How much autonomy each tool gets. Exact names win over wildcards like <code>mcp__*</code>;
          any tool not listed needs a <code>{FALLBACK_TOOL_MODE}</code>. Changes apply to running
          agents right away.
        </p>
      </div>
      <AsyncView result={policy} errorTitle="Could not load the policy">
        {(value) => <PolicyEditor key={JSON.stringify(value)} project={project} policy={value} />}
      </AsyncView>
    </section>
  )
}

function PolicyEditor({
  project,
  policy,
}: {
  readonly project: Project
  readonly policy: ToolPolicy
}) {
  const save = useAtomSet(setPolicyAtom, { mode: "promiseExit" })
  const [rules, setRules] = useState<ReadonlyArray<ToolRule>>(policy.rules)
  const [newPattern, setNewPattern] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const dirty = JSON.stringify(rules) !== JSON.stringify(policy.rules)

  const setMode = (pattern: string, mode: ToolMode) =>
    setRules((current) =>
      current.map((rule) => (rule.pattern === pattern ? { pattern, mode } : rule)),
    )

  const add = (event: FormEvent) => {
    event.preventDefault()
    const pattern = newPattern.trim()
    if (pattern === "" || rules.some((rule) => rule.pattern === pattern)) return
    setRules((current) => [...current, { pattern, mode: "confirm" }])
    setNewPattern("")
  }

  const submit = async () => {
    setPending(true)
    setError(undefined)
    const exit = await save({
      payload: { projectId: project.id, policy: { rules: [...rules] } },
      reactivityKeys: [keys.policy(project.id)],
    })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tool</TableHead>
            <TableHead className="w-64">Mode</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.pattern}>
              <TableCell className="font-mono text-xs">{rule.pattern}</TableCell>
              <TableCell>
                <Select
                  value={rule.mode}
                  onValueChange={(mode) => setMode(rule.pattern, mode as ToolMode)}
                >
                  <SelectTrigger className="w-60" aria-label={`Mode for ${rule.pattern}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove the rule for ${rule.pattern}`}
                  onClick={() =>
                    setRules((current) => current.filter((r) => r.pattern !== rule.pattern))
                  }
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <form onSubmit={add} className="flex gap-2">
        <Input
          value={newPattern}
          onChange={(event) => setNewPattern(event.target.value)}
          placeholder="Tool name or prefix, e.g. mcp__github__*"
          className="font-mono"
          aria-label="New tool rule"
        />
        <Button type="submit" variant="outline" disabled={newPattern.trim() === ""}>
          <Plus />
          Add rule
        </Button>
      </form>
      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <Button variant="ghost" onClick={() => setRules(policy.rules)} disabled={pending}>
            Discard
          </Button>
        )}
        <Button onClick={submit} disabled={!dirty || pending}>
          <Save />
          {pending ? "Saving…" : "Save policy"}
        </Button>
      </div>
      {error !== undefined && <ErrorNote title="The policy was not saved" message={error} />}
    </div>
  )
}
