import { useAtomValue } from "@effect/atom-react"
import type { ApprovalRecord, Project } from "@humanity/contracts"
import { Link } from "@tanstack/react-router"
import { AsyncView } from "@/components/AsyncView"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { describeDecision } from "@/features/timeline/timeline"
import { ApprovalBadge } from "@/features/tools/ToolCallCard"
import { historyAtom } from "./atoms.ts"
import { ScrollArea } from "@/components/ui/scroll-area"

const when = (record: ApprovalRecord) => {
  const approval = record.approval
  const at =
    approval._tag === "change"
      ? (approval.change.decidedAt ?? approval.change.createdAt)
      : (approval.confirmation.decidedAt ?? approval.confirmation.createdAt)
  return { iso: at, label: new Date(at).toLocaleString() }
}

/** Everything the human allowed or denied across the project's sessions, newest first. */
export function DecisionHistoryCard({ project }: { readonly project: Project }) {
  const history = useAtomValue(historyAtom(project.id))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision history</CardTitle>
        <CardDescription>What you allowed and denied, across sessions.</CardDescription>
      </CardHeader>
      <CardContent>
        <AsyncView result={history} errorTitle="Could not load the decision history">
          {(records) =>
            records.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions yet.</p>
            ) : (
              <ScrollArea className="rounded-md border" viewportClassName="max-h-96">
                <ul className="flex flex-col divide-y text-sm">
                  {records.map((record) => (
                    <HistoryRow
                      key={
                        record.approval._tag === "change"
                          ? record.approval.change.id
                          : record.approval.confirmation.id
                      }
                      project={project}
                      record={record}
                    />
                  ))}
                </ul>
              </ScrollArea>
            )
          }
        </AsyncView>
      </CardContent>
    </Card>
  )
}

function HistoryRow({
  project,
  record,
}: {
  readonly project: Project
  readonly record: ApprovalRecord
}) {
  const { approval } = record
  const sessionId =
    approval._tag === "change" ? approval.change.sessionId : approval.confirmation.sessionId
  const time = when(record)
  // A change still waiting links straight to it.
  const search =
    approval._tag === "change" && approval.change.status === "pending"
      ? { file: approval.change.filePath }
      : {}
  return (
    <li>
      <Link
        to="/projects/$projectId/sessions/$sessionId"
        params={{ projectId: project.id, sessionId }}
        search={search}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-muted/50"
      >
        <span className="min-w-0 flex-1 truncate">{describeDecision(approval)}</span>
        <span className="text-xs">
          <ApprovalBadge approval={approval} denied={false} />
        </span>
        <span className="w-full text-xs text-muted-foreground sm:w-auto">
          {record.sessionTitle} · <time dateTime={time.iso}>{time.label}</time>
        </span>
      </Link>
    </li>
  )
}
