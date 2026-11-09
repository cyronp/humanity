import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { Project, RepoStatus, StatusEntry } from "@humanity/contracts"
import { ArrowDown, ArrowUp, GitBranch, RefreshCw } from "lucide-react"
import { AsyncView } from "@/components/AsyncView"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FileDiffView } from "@/features/diff/FileDiffView"
import { statusAtom, workingTreeDiffAtom } from "./atoms.ts"

const KIND_LABEL: Record<StatusEntry["kind"], string> = {
  modified: "modified",
  added: "added",
  deleted: "deleted",
  renamed: "renamed",
  copied: "copied",
  untracked: "untracked",
  conflicted: "conflict",
  type_changed: "type changed",
}

/** Status and uncommitted diff of the user's own working copy. Read-only. */
export function StatusCard({ project }: { readonly project: Project }) {
  const status = useAtomValue(statusAtom(project.id))
  const diff = useAtomValue(workingTreeDiffAtom(project.id))
  const refreshStatus = useAtomRefresh(statusAtom(project.id))
  const refreshDiff = useAtomRefresh(workingTreeDiffAtom(project.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Working copy</CardTitle>
        <CardDescription>
          What is uncommitted in <code>{project.localPath}</code>. Humanity only reads it.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refreshStatus()
              refreshDiff()
            }}
          >
            <RefreshCw />
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AsyncView result={status} errorTitle="Could not read git status">
          {(value) => <StatusSummary status={value} />}
        </AsyncView>
        <AsyncView result={diff} errorTitle="Could not read the working tree diff">
          {(value) =>
            value.files.length === 0 ? null : (
              <div className="flex flex-col gap-6">
                {value.files.map((file) => (
                  <FileDiffView key={file.filePath} file={file} />
                ))}
              </div>
            )
          }
        </AsyncView>
      </CardContent>
    </Card>
  )
}

function StatusSummary({ status }: { readonly status: RepoStatus }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">
          <GitBranch />
          {status.branch ?? "detached HEAD"}
        </Badge>
        {status.upstream !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <code>{status.upstream}</code>
            <ArrowUp className="size-3" />
            {status.ahead}
            <ArrowDown className="size-3" />
            {status.behind}
          </span>
        )}
        {status.entries.length === 0 && (
          <span className="text-xs text-muted-foreground">Clean, nothing to commit.</span>
        )}
      </div>
      {status.entries.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {status.entries.map((entry) => (
            <li key={entry.path} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <Badge variant={entry.kind === "conflicted" ? "destructive" : "outline"}>
                {KIND_LABEL[entry.kind]}
              </Badge>
              <code className="font-mono break-all">{entry.path}</code>
              {entry.previousPath !== undefined && (
                <span className="text-muted-foreground">
                  from <code>{entry.previousPath}</code>
                </span>
              )}
              {entry.staged && <span className="ml-auto text-muted-foreground">staged</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
