import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { type CSSProperties, useState } from "react"
import { projectIconAtom } from "./atoms.ts"

/** A stable hue per project, so fallbacks are told apart at a glance. */
const hueOf = (name: string) => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

/**
 * The project's favicon from its repository. Projects without one (or while
 * it loads, or if it fails to decode) show their initial on a coloured tile.
 */
export function ProjectIcon({
  project,
  className,
}: {
  readonly project: Pick<Project, "id" | "name">
  readonly className?: string
}) {
  const result = useAtomValue(projectIconAtom(project.id))
  const [broken, setBroken] = useState(false)
  const icon = AsyncResult.isSuccess(result) ? result.value : null

  if (icon !== null && !broken) {
    return (
      <img
        src={`data:${icon.mimeType};base64,${icon.base64}`}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={() => setBroken(true)}
        className={cn("size-5 shrink-0 rounded-sm object-contain", className)}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      style={{ "--project-hue": hueOf(project.name) } as CSSProperties}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-sm bg-[oklch(0.9_0.06_var(--project-hue))] text-[0.625rem] font-semibold text-[oklch(0.35_0.08_var(--project-hue))] uppercase dark:bg-[oklch(0.35_0.06_var(--project-hue))] dark:text-[oklch(0.92_0.05_var(--project-hue))]",
        className,
      )}
    >
      {project.name.trim().charAt(0) || "?"}
    </span>
  )
}
