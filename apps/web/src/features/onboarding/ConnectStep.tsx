import { ClaudeConnectionPanel } from "@/features/claude/ClaudeConnectionPanel"

export function ConnectStep() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Connect your Claude account</h2>
        <p className="max-w-prose text-muted-foreground">
          Here is the account Humanity's agent sessions will run as. You can change it at any time
          with <code>claude auth login</code>, and come back to this page from the Claude badge in
          the header.
        </p>
      </div>
      <ClaudeConnectionPanel />
    </div>
  )
}
