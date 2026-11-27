import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { countChanges } from "@humanity/diff"
import {
  type BranchComparison,
  type BranchPublication,
  type Forge,
  type Session,
  forgeTerms,
} from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { ChevronLeft, GitPullRequest } from "lucide-react"
import { useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ChangeCount, FileDiffView } from "@/features/diff/FileDiffView"
import { branchesAtom } from "@/features/git/atoms"
import { useProject } from "@/features/projects/atoms"
import { describeCause } from "@/lib/errors"
import { useNow } from "@/lib/elapsed"
import { keys } from "@/lib/rpc"
import { comparisonAtom, comparisonKey, createPullRequestAtom } from "../atoms.ts"
import { isBusy } from "../state.ts"
import { CommitRow } from "./CommitsTab.tsx"
import { fileKey } from "./DiffTab.tsx"
import { Hinted, WAIT_FOR_AGENT } from "./PrimaryAction.tsx"
import { baseBranches } from "./publication.ts"

export function OpenPullRequestPage({
  session,
  publication,
  forge,
  branch,
  titlebarPadding,
  onBack,
}: {
  readonly session: Session
  readonly publication: BranchPublication
  readonly forge: Forge
  readonly branch: string
  readonly titlebarPadding: string
  readonly onBack: () => void
}) {
  const create = useAtomSet(createPullRequestAtom, { mode: "promiseExit" })
  const branches = useAtomValue(branchesAtom(session.projectId))
  const terms = forgeTerms(forge)
  const [base, setBase] = useState(publication.defaultBranch)
  const comparison = useAtomValue(comparisonAtom(comparisonKey(session.id, base)))
  const [title, setTitle] = useState<string | null>(null)
  const [body, setBody] = useState("")
  const draftByDefault = useProject(session.projectId)?.settings.draftPullRequests ?? false
  const [draft, setDraft] = useState(draftByDefault)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const busy = isBusy(session.status)

  const known = AsyncResult.isSuccess(branches) ? branches.value : []
  const bases = baseBranches(known, branch, publication.defaultBranch)
  const suggested =
    known.find((each) => !each.isRemote && each.name === branch)?.subject ??
    (AsyncResult.isSuccess(comparison) ? comparison.value.commits[0]?.subject : undefined) ??
    ""
  const shownTitle = title ?? suggested
  const { noun } = forgeTerms(forge)

  const run = async () => {
    if (shownTitle.trim() === "" || pending || busy) return
    setPending(true)
    setError(undefined)
    const exit = await create({
      payload: {
        sessionId: session.id,
        pullRequest: { title: shownTitle.trim(), body, base, draft },
      },
      reactivityKeys: [
        keys.publication(session.id),
        keys.sessionCommits(session.id),
        keys.git(session.projectId),
        keys.sync(session.id),
      ],
    })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
    else onBack()
  }

  const cut = branch.lastIndexOf("/") + 1

  return (
    <>
      <div
        className="titlebar flex h-12 shrink-0 items-center gap-1 border-b pl-1.5"
        style={{ paddingRight: titlebarPadding }}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Back to Source control"
          title="Back to Source control"
        >
          <ChevronLeft />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">Open a {noun}</h2>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <GitPullRequest className="size-3.5 shrink-0" />
            <span>Into</span>
            <Select value={base} onValueChange={setBase}>
              <SelectTrigger
                size="sm"
                className="max-w-48 font-mono text-xs"
                aria-label="Base branch"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bases.map((name) => (
                  <SelectItem key={name} value={name} className="font-mono text-xs">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span aria-hidden className="text-muted-foreground/60">
              ←
            </span>
            <code className="min-w-0 font-mono wrap-anywhere">
              <span className="text-muted-foreground/70">{branch.slice(0, cut)}</span>
              <span className="text-foreground">{branch.slice(cut)}</span>
            </code>
          </div>
          <Input
            value={shownTitle}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            aria-label="Title"
            className="h-9 text-[0.9375rem] font-medium"
            autoFocus
          />
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            placeholder="Description (optional). Markdown works."
            aria-label="Description"
            className="min-h-28"
          />
          {error !== undefined && (
            <ErrorNote title={`The ${terms.noun} was not opened`} message={error} />
          )}
          <AsyncView result={comparison} errorTitle={`Could not compare ${branch} with ${base}`}>
            {(value) => (
              <Carries
                comparison={value}
                forge={publication.forge}
                editorRoot={session.worktreePath}
              />
            )}
          </AsyncView>
        </div>
      </ScrollArea>
      <div className="flex shrink-0 items-center gap-2 border-t p-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={draft} onCheckedChange={(next) => setDraft(next === true)} />
          Draft
        </label>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Cancel
        </Button>
        <Hinted hint={busy ? WAIT_FOR_AGENT : null}>
          <Button
            size="sm"
            disabled={shownTitle.trim() === "" || pending || busy}
            onClick={() => void run()}
          >
            {pending ? <Spinner className="size-3.5" /> : <GitPullRequest />}
            {pending ? "Opening…" : draft ? "Open as draft" : `Open ${noun}`}
          </Button>
        </Hinted>
      </div>
    </>
  )
}

function Carries({
  comparison,
  forge,
  editorRoot,
}: {
  readonly comparison: BranchComparison
  readonly forge: Forge | null
  readonly editorRoot: string
}) {
  const now = useNow(60_000)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const total = countChanges(comparison.files.flatMap((file) => file.hunks))
  if (comparison.commits.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Nothing to carry: this branch has no commits that <code>{comparison.base}</code> lacks.
      </p>
    )
  }
  const toggle = (key: string, next: boolean) =>
    setOpen((current) => {
      const updated = new Set(current)
      if (next) updated.add(key)
      else updated.delete(key)
      return updated
    })
  return (
    <>
      <section className="flex flex-col gap-2" aria-label="Commits">
        <h3 className="flex items-baseline gap-2 text-sm font-medium">
          Commits
          <span className="text-xs font-normal text-muted-foreground">
            {comparison.commits.length}
            {comparison.more ? "+" : ""}
          </span>
        </h3>
        <ul className="-mx-4 divide-y border-y">
          {comparison.commits.map((commit) => (
            <CommitRow key={commit.hash} commit={commit} forge={forge} now={now} />
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2" aria-label="Files changed">
        <h3 className="flex items-baseline gap-2 text-sm font-medium">
          Files changed
          <span className="flex items-baseline gap-1.5 text-xs font-normal text-muted-foreground">
            {comparison.files.length}
            <ChangeCount {...total} />
          </span>
        </h3>
        <div className="-mx-4 border-t">
          {comparison.files.map((file) => {
            const key = fileKey(file)
            return (
              <FileDiffView
                key={key}
                file={file}
                flat
                editorRoot={editorRoot}
                open={open.has(key)}
                onOpenChange={(next) => toggle(key, next)}
              />
            )
          })}
        </div>
      </section>
    </>
  )
}
