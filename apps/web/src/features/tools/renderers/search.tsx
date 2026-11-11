import { resultLines, shortPath, stringField } from "../inputs.ts"
import type { ToolCallProps, ToolRenderer } from "../registry.ts"
import { OutputText } from "./common.tsx"
import { ScrollArea } from "@/components/ui/scroll-area"

const MAX_RESULTS = 200

function Results({ call, worktreePath }: ToolCallProps) {
  const output = call?.output
  if (output == null) return <p className="text-muted-foreground">Searching…</p>
  if (output.isError) return <OutputText text={output.content} error />
  const results = resultLines(output.content)
  if (results.length === 0) return <p className="text-muted-foreground">No matches.</p>
  return (
    <ScrollArea className="rounded-md border bg-muted/40 font-mono" viewportClassName="max-h-80">
      <ul className="p-2">
        {results.slice(0, MAX_RESULTS).map((line, position) => (
          <li key={position} className="truncate" title={line}>
            {shortPath(line, worktreePath)}
          </li>
        ))}
        {results.length > MAX_RESULTS && (
          <li className="text-muted-foreground">{results.length - MAX_RESULTS} more…</li>
        )}
      </ul>
    </ScrollArea>
  )
}

const count = ({ call }: ToolCallProps) => {
  const output = call?.output
  if (output == null || output.isError) return undefined
  const lines = resultLines(output.content)
  return lines.length === 1 && /^No (files|matches) found/i.test(lines[0] ?? "") ? 0 : lines.length
}

export const searchRenderer: ToolRenderer = {
  name: "Glob/Grep",
  match: (toolName) => toolName === "Glob" || toolName === "Grep",
  Summary: (props) => {
    const { toolName, input, worktreePath } = props
    const path = stringField(input, "path")
    const glob = stringField(input, "glob")
    const found = count(props)
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="text-muted-foreground">{toolName}</span>
        <code className="truncate font-mono">{stringField(input, "pattern") ?? ""}</code>
        {glob !== undefined && <code className="shrink-0 text-muted-foreground">{glob}</code>}
        {path !== undefined && (
          <span className="shrink-0 truncate text-muted-foreground">
            in {shortPath(path, worktreePath)}
          </span>
        )}
        {found !== undefined && (
          <span className="shrink-0 text-muted-foreground">
            · {found} result{found === 1 ? "" : "s"}
          </span>
        )}
      </span>
    )
  },
  Detail: Results,
}
