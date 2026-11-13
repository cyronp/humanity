import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Branch, BranchPublication, Forge, PullRequest, Session } from "@humanity/contracts"
import { Exit } from "effect"
import { ArrowUpFromLine, GitBranch, GitPullRequest } from "lucide-react"
import { type FormEvent, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
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
import { branchesAtom } from "@/features/git/atoms"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import {
  createPullRequestAtom,
  feedKey,
  publicationAtom,
  pullRequestFeedAtom,
  pushAtom,
} from "../atoms.ts"
import { isBusy } from "../state.ts"
import { FeedNote } from "./FeedNote.tsx"
import { baseBranches, forgeTerms, needsPush, remoteStatus } from "./publication.ts"
import { PullRequestHeading } from "./PullRequestHeading.tsx"

/** With nothing left to commit: push the branch, then open its pull request or show the one it has. */
export function PublishSection({
  session,
  onOpenPullRequest,
}: {
  readonly session: Session
  readonly onOpenPullRequest: () => void
}) {
  const publication = useAtomValue(publicationAtom(session.id))
  return (
    <AsyncView result={publication} errorTitle="Could not read the branch">
      {(value) => (
        <div className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted-foreground">Nothing left to commit.</p>
          <BranchCard session={session} publication={value} />
          {value.forge === null ? (
            <p className="text-xs text-muted-foreground">
              This project&apos;s origin is not on GitHub or on a connected GitLab instance, so pull
              requests can&apos;t be opened from here.
            </p>
          ) : (
            <NextStep
              session={session}
              publication={value}
              forge={value.forge}
              onOpenPullRequest={onOpenPullRequest}
            />
          )}
        </div>
      )}
    </AsyncView>
  )
}

/** The branch, where it stands against its remote, and a push when it needs one. */
function BranchCard({
  session,
  publication,
}: {
  readonly session: Session
  readonly publication: BranchPublication
}) {
  const push = useAtomSet(pushAtom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const busy = isBusy(session.status)

  const onPush = async () => {
    setPending(true)
    setError(undefined)
    const exit = await push({
      payload: { sessionId: session.id },
      reactivityKeys: [keys.publication(session.id), keys.git(session.projectId)],
    })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-3">
      <div className="flex items-center gap-2">
        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
        <code className="min-w-0 flex-1 truncate font-mono text-sm">
          {publication.branch ?? "detached HEAD"}
        </code>
        {needsPush(publication) && (
          <Button size="sm" variant="outline" disabled={busy || pending} onClick={onPush}>
            <ArrowUpFromLine />
            {pending ? "Pushing…" : "Push"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{remoteStatus(publication)}</p>
      {busy && needsPush(publication) && (
        <p className="text-xs text-muted-foreground">
          Wait for the agent to finish before pushing.
        </p>
      )}
      {error !== undefined && <ErrorNote title="The push failed" message={error} />}
    </div>
  )
}

/** What the forge says of the branch, then the pull request it has or the form to open one. */
function NextStep({
  session,
  publication,
  forge,
  onOpenPullRequest,
}: {
  readonly session: Session
  readonly publication: BranchPublication
  readonly forge: Forge
  readonly onOpenPullRequest: () => void
}) {
  const feed = useAtomValue(pullRequestFeedAtom(feedKey(session.id, publication.branch)))
  return (
    <AsyncView result={feed} errorTitle="Could not load the pull request">
      {(value) => (
        <>
          <FeedNote feed={value} forge={forge} />
          <PullRequestStep
            session={session}
            publication={publication}
            forge={forge}
            pullRequest={value.pullRequest}
            onOpenPullRequest={onOpenPullRequest}
          />
        </>
      )}
    </AsyncView>
  )
}

/** The pull request the branch has, the form to open one, or why it can't be opened from here. */
function PullRequestStep({
  session,
  publication,
  forge,
  pullRequest,
  onOpenPullRequest,
}: {
  readonly session: Session
  readonly publication: BranchPublication
  readonly forge: Forge
  readonly pullRequest: PullRequest | null
  readonly onOpenPullRequest: () => void
}) {
  const branches = useAtomValue(branchesAtom(session.projectId))
  const { branch } = publication

  if (pullRequest !== null && pullRequest.state !== "closed") {
    return (
      <div className="flex flex-col gap-3 rounded-md border bg-card p-3">
        <PullRequestHeading pullRequest={pullRequest} />
        <Button variant="outline" size="sm" className="self-start" onClick={onOpenPullRequest}>
          <GitPullRequest />
          Checks and comments
        </Button>
      </div>
    )
  }
  if (branch === null) return null
  if (branch === publication.defaultBranch) {
    return (
      <p className="text-xs text-muted-foreground">
        You are on <code>{branch}</code>, the project&apos;s default branch. Set up a worktree to
        give this thread a branch of its own, then open a {forgeTerms(forge).noun} from it.
      </p>
    )
  }
  return (
    <AsyncView result={branches} errorTitle="Could not list the branches">
      {(list) => (
        <PullRequestForm
          session={session}
          publication={publication}
          forge={forge}
          branch={branch}
          branches={list}
        />
      )}
    </AsyncView>
  )
}

function PullRequestForm({
  session,
  publication,
  forge,
  branch,
  branches,
}: {
  readonly session: Session
  readonly publication: BranchPublication
  readonly forge: Forge
  readonly branch: string
  readonly branches: ReadonlyArray<Branch>
}) {
  const create = useAtomSet(createPullRequestAtom, { mode: "promiseExit" })
  const terms = forgeTerms(forge)
  const bases = baseBranches(branches, branch, publication.defaultBranch)
  // The last commit's subject is usually the title it wants.
  const [title, setTitle] = useState(
    () => branches.find((each) => !each.isRemote && each.name === branch)?.subject ?? "",
  )
  const [body, setBody] = useState("")
  const [base, setBase] = useState(publication.defaultBranch)
  const [draft, setDraft] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const busy = isBusy(session.status)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (title.trim() === "" || pending) return
    setPending(true)
    setError(undefined)
    const exit = await create({
      payload: { sessionId: session.id, pullRequest: { title: title.trim(), body, base, draft } },
      reactivityKeys: [keys.publication(session.id), keys.git(session.projectId)],
    })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border bg-card p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <GitPullRequest className="size-4" />
        Open a {terms.noun}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pr-title">Title</Label>
        <Input id="pr-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pr-body">Description</Label>
        <Textarea
          id="pr-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          placeholder="What changes, and why. Markdown works."
        />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label>Merge into</Label>
          <Select value={base} onValueChange={setBase}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bases.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="pr-draft" checked={draft} onCheckedChange={setDraft} />
          <Label htmlFor="pr-draft">Draft</Label>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {busy
            ? "Wait for the agent to finish first."
            : needsPush(publication)
              ? `Pushes ${branch} to ${terms.site} first.`
              : null}
        </span>
        <Button type="submit" disabled={busy || pending || title.trim() === ""}>
          {pending ? "Opening…" : `Open ${terms.noun}`}
        </Button>
      </div>
      {error !== undefined && (
        <ErrorNote title={`The ${terms.noun} was not opened`} message={error} />
      )}
    </form>
  )
}
