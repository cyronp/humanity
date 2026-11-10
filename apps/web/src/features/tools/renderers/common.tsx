import { cn } from "cn"
import { type ReactNode, useMemo } from "react"
import { CodeBlock } from "../CodeBlock.tsx"

export function Path({ path }: { readonly path: string }) {
  return (
    <code className="truncate font-mono" title={path}>
      {path === "" ? "(no path)" : path}
    </code>
  )
}

export function Field({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/** A tool's text output, or its error. */
export function OutputText({
  text,
  error = false,
}: {
  readonly text: string
  readonly error?: boolean
}) {
  return (
    <pre
      className={cn(
        "max-h-80 overflow-auto rounded-md border p-2 font-mono whitespace-pre-wrap break-all",
        error ? "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300" : "bg-muted/40",
      )}
    >
      {text === "" ? "(empty)" : text}
    </pre>
  )
}

/** Any value as highlighted JSON: the fallback view of inputs and outputs. */
export function JsonBlock({
  value,
  className = "max-h-80",
}: {
  readonly value: unknown
  readonly className?: string
}) {
  const json = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2) ?? "undefined"
    } catch {
      return String(value)
    }
  }, [value])
  return <CodeBlock code={json} language="json" className={className} />
}
