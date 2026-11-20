import type { Forge } from "@humanity/contracts"
import { cn } from "cn"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GitHubIcon } from "@/features/github/GitHubIcon"
import { GitLabIcon } from "@/features/gitlab/GitLabIcon"
import { forgeTerms } from "./publication.ts"

export function ForgeLink({
  url,
  forge,
  label,
  className,
}: {
  readonly url: string
  readonly forge: Forge | null
  readonly label: string
  readonly className?: string
}) {
  const title = forge === null ? label : `${label} on ${forgeTerms(forge).site}`
  const Icon = forge === "github" ? GitHubIcon : forge === "gitlab" ? GitLabIcon : ExternalLink
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      asChild
      className={cn("shrink-0 text-muted-foreground hover:text-foreground", className)}
    >
      <a href={url} target="_blank" rel="noreferrer" aria-label={title} title={title}>
        <Icon className="size-3.5" />
      </a>
    </Button>
  )
}
