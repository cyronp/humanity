import { PATCH_TOOL } from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { HunkView } from "@/features/diff/HunkView"
import { shortPath } from "../inputs.ts"
import { type PatchedFile, patchFiles } from "../patch.ts"
import type { ToolCallProps, ToolRenderer } from "../registry.ts"
import { OutputText, Path } from "./common.tsx"

const KIND_LABEL: Record<PatchedFile["kind"], string> = {
  add: "Create",
  delete: "Delete",
  update: "Edit",
}

const usePatch = (props: ToolCallProps) => useMemo(() => patchFiles(props.input), [props.input])

export const patchRenderer: ToolRenderer = {
  name: "ApplyPatch",
  match: (toolName) => toolName === PATCH_TOOL,
  Summary: (props) => {
    const files = usePatch(props)
    const first = files[0]
    const counts = countChanges(files.flatMap((file) => file.hunks))
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="text-muted-foreground">
          {files.length === 1 && first !== undefined ? KIND_LABEL[first.kind] : "Patch"}
        </span>
        <Path path={first === undefined ? "" : shortPath(first.path, props.worktreePath)} />
        {files.length > 1 && (
          <span className="shrink-0 text-muted-foreground">+{files.length - 1} more</span>
        )}
        <ChangeCount {...counts} />
      </span>
    )
  },
  Detail: (props) => {
    const files = usePatch(props)
    const output = props.call?.output
    return (
      <div className="flex flex-col gap-3">
        {files.length === 0 && <p className="text-muted-foreground">The patch names no files.</p>}
        {files.map((file) => {
          const path = shortPath(file.path, props.worktreePath)
          return (
            <div key={file.path} className="flex flex-col gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="secondary">{KIND_LABEL[file.kind]}</Badge>
                <Path path={path} />
                {file.movePath !== undefined && (
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    moved to <Path path={shortPath(file.movePath, props.worktreePath)} />
                  </span>
                )}
              </div>
              {file.hunks.map((hunk) => (
                <HunkView key={hunk.index} hunk={hunk} filePath={path} />
              ))}
            </div>
          )
        })}
        {output?.isError === true && <OutputText text={output.content} error />}
      </div>
    )
  },
}
