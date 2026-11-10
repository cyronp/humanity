import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import type { CSSProperties } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { projectIconAtom } from "./atoms.ts"

/** A stable hue per project, so fallbacks are told apart at a glance. */
const hueOf = (name: string) => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

/**
 * The project's avatar: its favicon from the repository, on shadcn's Avatar.
 * Without one (or while it loads, or if it fails to decode) the fallback
 * shows the project's initial on a tile coloured by its name.
 */
export function ProjectIcon({
  project,
  className,
}: {
  readonly project: Pick<Project, "id" | "name">
  readonly className?: string
}) {
  const result = useAtomValue(projectIconAtom(project.id))
  const icon = AsyncResult.isSuccess(result) ? result.value : null

  return (
    <Avatar
      aria-hidden="true"
      className={cn("size-5 after:hidden", className)}
      style={{ "--project-hue": hueOf(project.name) } as CSSProperties}
    >
      {icon !== null && (
        <AvatarImage
          src={`data:${icon.mimeType};base64,${icon.base64}`}
          alt=""
          draggable={false}
          className="object-contain"
        />
      )}
      <AvatarFallback className="bg-[oklch(0.9_0.06_var(--project-hue))] text-[0.625rem] font-semibold text-[oklch(0.35_0.08_var(--project-hue))] uppercase dark:bg-[oklch(0.35_0.06_var(--project-hue))] dark:text-[oklch(0.92_0.05_var(--project-hue))]">
        {project.name.trim().charAt(0) || "?"}
      </AvatarFallback>
    </Avatar>
  )
}
