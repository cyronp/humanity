import { TerminalOutput } from "../CodeBlock.tsx"
import { bashOutput, stringField } from "../inputs.ts"
import type { ToolRenderer } from "../registry.ts"
import { Field } from "./common.tsx"

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
        <Field label="Command">
          <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono whitespace-pre-wrap break-all">
            {stringField(input, "command") ?? ""}
          </pre>
        </Field>
        {structured !== undefined ? (
          <>
            {structured.stdout !== "" && (
              <Field label="Output">
                <TerminalOutput text={structured.stdout} />
              </Field>
            )}
            {structured.stderr !== "" && (
              <Field label="Errors">
                <TerminalOutput text={structured.stderr} className="border-red-500/40" />
              </Field>
            )}
            {structured.stdout === "" && structured.stderr === "" && (
              <p className="text-muted-foreground">No output.</p>
            )}
            {structured.interrupted && (
              <p className="text-amber-600">The command was interrupted.</p>
            )}
          </>
        ) : output != null ? (
          <Field label={output.isError ? "Error" : "Output"}>
            <TerminalOutput
              text={output.content}
              {...(output.isError ? { className: "border-red-500/40" } : {})}
            />
          </Field>
        ) : null}
      </div>
    )
  },
}
