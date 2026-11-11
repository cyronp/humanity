import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Branch, Project } from "@humanity/contracts"
import { Exit } from "effect"
import { GitBranch, Plus } from "lucide-react"
import { type FormEvent, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { branchesAtom, createBranchAtom } from "./atoms.ts"
import { ScrollArea } from "@/components/ui/scroll-area"

export function BranchesCard({ project }: { readonly project: Project }) {
  const result = useAtomValue(branchesAtom(project.id))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branches</CardTitle>
        <CardDescription>
          Creating a branch only adds a ref. Your working copy is never switched.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AsyncView result={result} errorTitle="Could not list branches">
          {(branches) => (
            <>
              <BranchList branches={branches} />
              <CreateBranchForm project={project} branches={branches} />
            </>
          )}
        </AsyncView>
      </CardContent>
    </Card>
  )
}

function BranchList({ branches }: { readonly branches: ReadonlyArray<Branch> }) {
  if (branches.length === 0) {
    return <p className="text-sm text-muted-foreground">This repository has no commits yet.</p>
  }
  return (
    <ScrollArea className="rounded-md border" viewportClassName="max-h-72">
      <ul className="flex flex-col divide-y">
        {branches.map((branch) => (
          <li key={branch.name} className="flex items-center gap-2 px-3 py-2 text-sm">
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <code className="font-mono text-xs">{branch.name}</code>
            {branch.isCurrent && <Badge>checked out</Badge>}
            {branch.isRemote && <Badge variant="outline">remote</Badge>}
            <span className="ml-auto truncate text-xs text-muted-foreground">
              <code>{branch.commit}</code> {branch.subject}
            </span>
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}

function CreateBranchForm({
  project,
  branches,
}: {
  readonly project: Project
  readonly branches: ReadonlyArray<Branch>
}) {
  const createBranch = useAtomSet(createBranchAtom, { mode: "promiseExit" })
  const [name, setName] = useState("")
  const [from, setFrom] = useState(project.defaultBranch)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === "" || pending) return
    setPending(true)
    setError(undefined)
    const exit = await createBranch({
      payload: { projectId: project.id, name, from },
      reactivityKeys: [keys.git(project.id)],
    })
    setPending(false)
    if (Exit.isSuccess(exit)) setName("")
    else setError(describeCause(exit.cause))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="new-branch-name"
          aria-label="New branch name"
          className="min-w-48 flex-1 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="text-xs text-muted-foreground">from</span>
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger className="w-48 font-mono" aria-label="Base branch">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.name} value={branch.name} className="font-mono">
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" disabled={pending || name.trim() === ""}>
          <Plus />
          Create branch
        </Button>
      </div>
      {error !== undefined && <ErrorNote title="Could not create the branch" message={error} />}
    </form>
  )
}
