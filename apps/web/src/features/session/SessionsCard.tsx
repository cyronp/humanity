import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Project, Session } from "@humanity/contracts"
import { Link, useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { GitBranch, MessageSquarePlus } from "lucide-react"
import { type FormEvent, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { branchesAtom } from "@/features/git/atoms"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { createSessionAtom, sessionsAtom } from "./atoms.ts"
import { StatusBadge } from "./StatusBadge.tsx"

export function SessionsCard({ project }: { readonly project: Project }) {
  const sessions = useAtomValue(sessionsAtom(project.id))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          Each session gets its own branch and git worktree. The agent never works in your checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <NewSessionForm project={project} />
        <AsyncView result={sessions} errorTitle="Could not list sessions">
          {(list) => (list.length === 0 ? null : <SessionList project={project} sessions={list} />)}
        </AsyncView>
      </CardContent>
    </Card>
  )
}

function SessionList({
  project,
  sessions,
}: {
  readonly project: Project
  readonly sessions: ReadonlyArray<Session>
}) {
  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link
            to="/projects/$projectId/sessions/$sessionId"
            params={{ projectId: project.id, sessionId: session.id }}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-muted/50"
          >
            <span className="font-medium">{session.title}</span>
            <StatusBadge status={session.status} />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="size-3.5" />
              <code>{session.branch}</code>
            </span>
            <time className="ml-auto text-xs text-muted-foreground" dateTime={session.updatedAt}>
              {new Date(session.updatedAt).toLocaleString()}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function NewSessionForm({ project }: { readonly project: Project }) {
  const branches = useAtomValue(branchesAtom(project.id))
  const create = useAtomSet(createSessionAtom, { mode: "promiseExit" })
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [baseBranch, setBaseBranch] = useState(project.defaultBranch)
  const [prompt, setPrompt] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const branchNames = branches._tag === "Success" ? branches.value.map((branch) => branch.name) : []
  const options = branchNames.includes(baseBranch) ? branchNames : [baseBranch, ...branchNames]

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(undefined)
    const exit = await create({
      payload: {
        projectId: project.id,
        baseBranch,
        ...(title.trim() === "" ? {} : { title: title.trim() }),
        ...(prompt.trim() === "" ? {} : { prompt: prompt.trim() }),
      },
      reactivityKeys: [keys.sessions(project.id), keys.git(project.id)],
    })
    setPending(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    void navigate({
      to: "/projects/$projectId/sessions/$sessionId",
      params: { projectId: project.id, sessionId: exit.value.id },
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="session-title">Title</FieldLabel>
          <Input
            id="session-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional. Taken from the first message otherwise."
            autoComplete="off"
          />
        </Field>
        {/* The branch list keeps its own width. */}
        <Field className="gap-1.5 *:w-auto">
          <FieldLabel htmlFor="session-base">Start from</FieldLabel>
          <Select value={baseBranch} onValueChange={setBaseBranch}>
            <SelectTrigger id="session-base" className="w-56 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((name) => (
                <SelectItem key={name} value={name} className="font-mono">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="session-prompt">First message</FieldLabel>
        <Textarea
          id="session-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="What should the agent look at?"
          rows={3}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <MessageSquarePlus />
          {pending ? "Creating worktree…" : "Start session"}
        </Button>
      </div>
      {error !== undefined && <ErrorNote title="Could not start the session" message={error} />}
    </form>
  )
}
