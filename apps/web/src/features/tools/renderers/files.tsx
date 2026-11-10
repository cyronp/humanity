import type { ProposedChange } from "@humanity/contracts"
import { computeHunks, countChanges } from "@humanity/diff"
import { cn } from "cn"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { HunkView } from "@/features/diff/HunkView"
import { languageForPath } from "@/features/diff/highlighter"
import { CodeBlock } from "../CodeBlock.tsx"
import { parseReadOutput, readRange, shortPath, stringField } from "../inputs.ts"
import type { ToolCallProps, ToolRenderer } from "../registry.ts"
import { OutputText, Path } from "./common.tsx"

const filePath = (props: ToolCallProps) =>
  shortPath(stringField(props.input, "file_path") ?? "", props.worktreePath)

export const readRenderer: ToolRenderer = {
  name: "Read",
  match: (toolName) => toolName === "Read",
  Summary: (props) => {
    const range = readRange(props.input)
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="text-muted-foreground">Read</span>
        <Path path={filePath(props)} />
        {range !== undefined && <span className="shrink-0 text-muted-foreground">{range}</span>}
      </span>
    )
  },
  Detail: (props) => {
    const output = props.call?.output
    if (output == null) return <p className="text-muted-foreground">Reading…</p>
    if (output.isError) return <OutputText text={output.content} error />
    const { firstLine, lines } = parseReadOutput(output.content)
    return (
      <CodeBlock
        code={lines.join("\n")}
        language={languageForPath(filePath(props))}
        firstLine={firstLine}
        maxLines={200}
        className="max-h-96"
      />
    )
  },
}

const changeOf = (props: ToolCallProps): ProposedChange | undefined =>
  props.approval?._tag === "change" ? props.approval.change : undefined

/** Hunks of the reviewed change, or a best-effort diff from the input alone. */
const useHunks = (props: ToolCallProps) =>
  useMemo(() => {
    const change = changeOf(props)
    if (change !== undefined) return { hunks: change.hunks, exact: true }
    if (props.toolName === "Edit") {
      const before = stringField(props.input, "old_string") ?? ""
      const after = stringField(props.input, "new_string") ?? ""
      return { hunks: computeHunks(before, after), exact: false }
    }
    return { hunks: undefined, exact: false }
  }, [props])

const VERDICT_STYLE = {
  approved: "border-emerald-500/60",
  rejected: "border-red-500/60",
  pending: "",
} as const

export const editRenderer: ToolRenderer = {
  name: "Edit/Write",
  match: (toolName) => toolName === "Edit" || toolName === "Write",
  Summary: (props) => {
    const { hunks } = useHunks(props)
    const change = changeOf(props)
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="text-muted-foreground">
          {props.toolName === "Write" && change?.kind !== "modify" ? "Create" : props.toolName}
        </span>
        <Path path={filePath(props)} />
        {hunks !== undefined && <ChangeCount {...countChanges(hunks)} />}
      </span>
    )
  },
  Detail: (props) => {
    const { hunks, exact } = useHunks(props)
    const path = filePath(props)
    if (hunks === undefined) {
      return (
        <CodeBlock
          code={stringField(props.input, "content") ?? ""}
          language={languageForPath(path)}
          firstLine={1}
          maxLines={200}
          className="max-h-96"
        />
      )
    }
    return (
      <div className="flex flex-col gap-2">
        {!exact && (
          <p className="text-muted-foreground">
            The replaced snippet only; line numbers are relative to it.
          </p>
        )}
        {hunks.map((hunk) => {
          const status = "status" in hunk ? hunk.status : "pending"
          const comment = "comment" in hunk ? hunk.comment : undefined
          return (
            <HunkView
              key={hunk.index}
              hunk={hunk}
              filePath={path}
              className={cn(exact && VERDICT_STYLE[status])}
              actions={
                exact && status !== "pending" ? (
                  <Badge variant={status === "approved" ? "secondary" : "destructive"}>
                    {status}
                  </Badge>
                ) : undefined
              }
              footer={
                comment === undefined ? undefined : (
                  <p className="border-t px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">Comment: </span>
                    {comment}
                  </p>
                )
              }
            />
          )
        })}
        {props.call?.output?.isError === true && (
          <OutputText text={props.call.output.content} error />
        )}
      </div>
    )
  },
}
