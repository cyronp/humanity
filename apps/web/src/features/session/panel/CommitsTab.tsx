import { useAtomValue } from "@effect/atom-react"
import type { BranchCommits, CommitSummary, Session } from "@humanity/contracts"
import { GitBranch } from "lucide-react"
import { AsyncView } from "@/components/AsyncView"
import { formatTimeAgo, useNow } from "@/lib/elapsed"
import { sessionCommitsAtom } from "../atoms.ts"

/**
 * The commits of the session's branch, newest first: those its project's
 * default branch lacks, or the latest ones on the default branch itself.
 */
export function CommitsTab({ session }: { readonly session: Session }) {
  const commits = useAtomValue(sessionCommitsAtom(session.id))
  return (
    <AsyncView result={commits} errorTitle="Could not read the branch's commits">
      {(value) => <CommitList value={value} />}
    </AsyncView>
  )
}

function CommitList({ value }: { readonly value: BranchCommits }) {
  const now = useNow(60_000)
  const count = `${value.commits.length}${value.more ? "+" : ""}`
  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs">
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
        <code className="min-w-0 truncate font-mono font-medium" title={value.branch}>
          {value.branch}
        </code>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {value.base === null ? "latest commits" : `${count} since ${value.base}`}
        </span>
      </div>
      {value.commits.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {value.base === null ? (
            "No commits yet."
          ) : (
            <>
              No commits on <code>{value.branch}</code> that <code>{value.base}</code> lacks yet.
            </>
          )}
        </p>
      ) : (
        <ul className="divide-y">
          {value.commits.map((commit) => (
            <CommitRow key={commit.hash} commit={commit} now={now} />
          ))}
        </ul>
      )}
      {value.more && (
        <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
          Only the latest {value.commits.length} are listed.
        </p>
      )}
    </div>
  )
}

function CommitRow({ commit, now }: { readonly commit: CommitSummary; readonly now: number }) {
  const ago = formatTimeAgo(commit.committedAt, now)
  return (
    <li className="flex flex-col gap-0.5 px-3 py-2 text-xs">
      <span className="truncate text-sm" title={commit.subject}>
        {commit.subject}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <code className="shrink-0 font-mono" title={commit.hash}>
          {commit.shortHash}
        </code>
        <span aria-hidden>•</span>
        <span className="truncate">{commit.author}</span>
        {ago !== "" && (
          <>
            <span aria-hidden>•</span>
            <time className="shrink-0" dateTime={commit.committedAt}>
              {ago}
            </time>
          </>
        )}
      </span>
    </li>
  )
}
