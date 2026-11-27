import { File } from "lucide-react"
import { FileIcon } from "./FileIcon.tsx"
import { nameOf } from "./tree.ts"

export function FileEntryLabel({
  path,
  icons,
}: {
  readonly path: string
  readonly icons: boolean
}) {
  return (
    <>
      {icons ? <FileIcon path={path} /> : <File className="text-muted-foreground" />}
      <span className="shrink-0 truncate">{nameOf(path)}</span>
      <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground">
        {path}
      </span>
    </>
  )
}
