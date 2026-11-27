import { useAtomValue } from "@effect/atom-react"
import {
  type BranchCommits,
  type CommitSummary,
  type Forge,
  type Session,
  plural,
  forgeTerms,
} from "@humanity/contracts"
import { GitCommitHorizontal } from "lucide-react"
import { AsyncView } from "@/components/AsyncView"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { formatTimeAgo, useNow } from "@/lib/elapsed"
import { PanelEmpty } from "@/components/PanelEmpty"
import { sessionCommitsAtom } from "../atoms.ts"
import { ForgeLink } from "./ForgeLink.tsx"

export function CommitsTab({
  session,
  forge,
}: {
  readonly session: Session
  readonly forge: Forge | null
}) {
  const commits = useAtomValue(sessionCommitsAtom(session.id))
  return (
    <AsyncView result={commits} errorTitle="Could not read the branch's commits">
      {(value) => <CommitList value={value} forge={forge} />}
    </AsyncView>
  )
}

function CommitList({
  value,
  forge,
}: {
  readonly value: BranchCommits
  readonly forge: Forge | null
}) {
  const now = useNow(60_000)
  if (value.commits.length === 0) {
    return (
      <PanelEmpty className="px-4">
        {value.base === null ? (
          "No commits yet."
        ) : (
          <>
            No commits on <code>{value.branch}</code> that <code>{value.base}</code> lacks yet.
          </>
        )}
      </PanelEmpty>
    )
  }
  return (
    <>
      <ul className="divide-y border-b">
        {value.commits.map((commit) => (
          <CommitRow key={commit.hash} commit={commit} forge={forge} now={now} />
        ))}
      </ul>
      {value.more && (
        <p className="px-4 py-2 text-xs text-muted-foreground">
          Only the latest {value.commits.length} are listed.
        </p>
      )}
    </>
  )
}

export function CommitRow({
  commit,
  forge,
  now,
}: {
  readonly commit: CommitSummary
  readonly forge: Forge | null
  readonly now: number
}) {
  const ago = formatTimeAgo(commit.committedAt, now)
  const site = forge === null ? "the remote" : forgeTerms(forge).site
  return (
    <li className="group/row flex items-start gap-2.5 px-4 py-2.5 hover:bg-muted/40">
      <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm" title={commit.subject}>
          {commit.subject}
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <code className="font-mono" title={commit.hash}>
            {commit.shortHash}
          </code>
          <Dot />
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar className="size-4 after:hidden">
              {commit.avatarUrl !== null && <AvatarImage src={commit.avatarUrl} alt="" />}
              <AvatarFallback className="text-[0.5rem]">
                {commit.author.trim().charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{commit.author}</span>
          </span>
          {ago !== "" && (
            <>
              <Dot />
              <time dateTime={commit.committedAt}>{ago}</time>
            </>
          )}
          {commit.files > 0 && (
            <>
              <Dot />
              <span>{plural(commit.files, "file")} changed</span>
              <Dot />
              <ChangeCount added={commit.insertions} removed={commit.deletions} />
            </>
          )}
        </span>
      </div>
      {commit.url !== null ? (
        <ForgeLink
          url={commit.url}
          forge={forge}
          label={`Open ${commit.shortHash}`}
          className="opacity-70 group-hover/row:opacity-100"
        />
      ) : (
        !commit.pushed && (
          <Badge
            variant="outline"
            className="shrink-0 font-normal text-muted-foreground"
            title={`Not on ${site} until it's pushed`}
          >
            not pushed
          </Badge>
        )
      )}
    </li>
  )
}

function Dot() {
  return (
    <span aria-hidden className="text-muted-foreground/60">
      ·
    </span>
  )
}
