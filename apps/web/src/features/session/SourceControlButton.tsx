import { useAtomValue } from "@effect/atom-react"
import type { Forge, Session } from "@humanity/contracts"
import { GitBranch } from "lucide-react"
import { AsyncResult } from "effect/reactivity"
import { Button } from "@/components/ui/button"
import { GitHubIcon } from "@/features/github/GitHubIcon"
import { GitLabIcon } from "@/features/gitlab/GitLabIcon"
import { publicationAtom } from "./atoms.ts"

/** The host's own mark, or a plain branch where Humanity can't tell the host. */
function ForgeMark({ forge }: { readonly forge: Forge | null }) {
  if (forge === "github") return <GitHubIcon />
  if (forge === "gitlab") return <GitLabIcon />
  return <GitBranch />
}

export function SourceControlButton({
  session,
  open,
  onToggle,
}: {
  readonly session: Session
  readonly open: boolean
  readonly onToggle: () => void
}) {
  const result = useAtomValue(publicationAtom(session.id))
  // A plain branch stands in until the host is known.
  const forge = AsyncResult.isSuccess(result) ? result.value.forge : null

  return (
    <Button
      variant={open ? "secondary" : "ghost"}
      size="sm"
      onClick={onToggle}
      aria-expanded={open}
    >
      <ForgeMark forge={forge} />
      Source Control
    </Button>
  )
}
