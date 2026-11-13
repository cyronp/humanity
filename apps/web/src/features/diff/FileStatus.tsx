import type { FileDiff } from "@humanity/contracts"
import { cn } from "cn"

type FileKind = FileDiff["kind"]

/**
 * How VS Code's Git integration marks a changed file: a coloured letter, and
 * the file name in the same colour (struck through once deleted).
 */
export const FILE_STATUS: Record<
  FileKind,
  { readonly letter: string; readonly label: string; readonly color: string }
> = {
  modify: { letter: "M", label: "Modified", color: "text-git-modified" },
  create: { letter: "A", label: "Added", color: "text-git-added" },
  delete: { letter: "D", label: "Deleted", color: "text-git-deleted" },
  rename: { letter: "R", label: "Renamed", color: "text-git-renamed" },
}

export const fileNameClass = (kind: FileKind) =>
  cn(FILE_STATUS[kind].color, kind === "delete" && "line-through")

export function FileStatusLetter({
  kind,
  className,
}: {
  readonly kind: FileKind
  readonly className?: string
}) {
  const status = FILE_STATUS[kind]
  return (
    <span
      className={cn(
        "inline-flex w-3 shrink-0 justify-center font-mono text-xs font-semibold",
        status.color,
        className,
      )}
      title={status.label}
      aria-label={status.label}
    >
      {status.letter}
    </span>
  )
}
