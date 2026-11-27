import { PROVIDER_NAMES, type Project, type Session } from "@humanity/contracts"
import { Clock, FolderGit2, GitBranch, Network, ShieldCheck } from "lucide-react"
import type { ReactNode } from "react"
import { AUTONOMY_OPTIONS } from "@/features/policy/AutonomyPicker"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { modelDisplayName } from "@/features/providers/models"
import { ProviderIcon } from "@/features/providers/ProviderIcon"
import { useProviderModels } from "@/features/providers/useProviderModels"
import { ThreadStatus } from "@/features/session/ThreadStatus"
import { formatElapsed } from "@/lib/elapsed"

export function ThreadPreview({
  session,
  project,
  parentTitle,
  now,
}: {
  readonly session: Session
  readonly project: Project
  readonly parentTitle: string | undefined
  readonly now: number
}) {
  const { models } = useProviderModels()
  const mode = AUTONOMY_OPTIONS.find((option) => option.value === session.autonomy)
  const updated = now - Date.parse(session.updatedAt)
  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 text-xs">
      <div className="flex flex-col gap-1.5">
        <span className="line-clamp-3 text-sm font-medium wrap-anywhere">{session.title}</span>
        <span className="text-muted-foreground">
          <ThreadStatus status={session.status} />
        </span>
      </div>
      <dl className="flex flex-col gap-2">
        <Fact icon={<ProjectIcon project={project} className="size-3.5" />} label="Project">
          {project.name}
        </Fact>
        <Fact
          icon={<ProviderIcon provider={session.provider} className="size-3.5" />}
          label="Model"
        >
          {modelDisplayName(models[session.provider], session.model)} ·{" "}
          {PROVIDER_NAMES[session.provider]}
        </Fact>
        <Fact
          icon={
            session.inWorktree ? (
              <FolderGit2 className="size-3.5" />
            ) : (
              <GitBranch className="size-3.5" />
            )
          }
          label={session.inWorktree ? "Worktree branch" : "Branch"}
        >
          <span className="font-mono">{session.branch}</span>
        </Fact>
        {mode !== undefined && (
          <Fact icon={<ShieldCheck className="size-3.5" />} label="Permissions">
            {mode.label}
          </Fact>
        )}
        {parentTitle !== undefined && (
          <Fact icon={<Network className="size-3.5" />} label="Started from">
            {parentTitle}
          </Fact>
        )}
        <Fact icon={<Clock className="size-3.5" />} label="Last activity">
          {updated < 1000 ? "just now" : `${formatElapsed(updated)} ago`}
        </Fact>
      </dl>
    </div>
  )
}

function Fact({
  icon,
  label,
  children,
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-px shrink-0 text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="wrap-anywhere">{children}</dd>
      </div>
    </div>
  )
}
