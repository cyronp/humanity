import { TerminalOutput } from "../CodeBlock.tsx"
import { bashOutput, stringField } from "../inputs.ts"
import type { ToolRenderer } from "../registry.ts"
import { DetailSection } from "./common.tsx"

export const shellRenderer: ToolRenderer = {
  name: "Bash",
  match: (toolName) => toolName === "Bash" || toolName === "PowerShell",
  Summary: ({ input }) => {
    const description = stringField(input, "description")
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <code className="truncate font-mono">
          <span className="text-muted-foreground select-none">$ </span>
          {stringField(input, "command") ?? ""}
        </code>
        {description !== undefined && (
          <span className="hidden shrink-0 truncate text-muted-foreground sm:inline">
            {description}
          </span>
        )}
      </span>
    )
  },
  Detail: ({ input, call }) => {
    const description = stringField(input, "description")
    const structured = bashOutput(call)
    const output = call?.output
    return (
      <div className="flex flex-col gap-2">
        {description !== undefined && <p>{description}</p>}
        <DetailSection label="Command">
          <pre className="rounded-md bg-muted p-2 font-mono whitespace-pre-wrap break-all">
            {stringField(input, "command") ?? ""}
          </pre>
        </DetailSection>
        {structured !== undefined ? (
          <>
            {structured.stdout !== "" && (
              <DetailSection label="Output">
                <TerminalOutput text={structured.stdout} links />
              </DetailSection>
            )}
            {structured.stderr !== "" && (
              <DetailSection label="Errors">
                <TerminalOutput text={structured.stderr} className="border-destructive/40" links />
              </DetailSection>
            )}
            {structured.stdout === "" && structured.stderr === "" && (
              <p className="text-muted-foreground">No output.</p>
            )}
            {structured.interrupted && <p className="text-warning">The command was interrupted.</p>}
          </>
        ) : output != null ? (
          <DetailSection label={output.isError ? "Error" : "Output"}>
            <TerminalOutput
              text={output.content}
              links
              {...(output.isError ? { className: "border-destructive/40" } : {})}
            />
          </DetailSection>
        ) : null}
      </div>
    )
  },
}
