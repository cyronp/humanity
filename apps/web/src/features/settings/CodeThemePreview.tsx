import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@/components/ui/code-block"
import { CodeLine } from "@/components/CodeLine"
import { useHighlightedLines } from "@/lib/highlighter"

export const CODE_THEME_SAMPLE: ReadonlyArray<string> = [
  'import { readFile } from "node:fs/promises"',
  "",
  "// Count the lines of every file the agent touched",
  "export async function countLines(paths: string[]): Promise<number> {",
  "  let total = 0",
  "  for (const path of paths) {",
  '    const text = await readFile(path, "utf8")',
  '    total += text.split("\\n").length',
  "  }",
  "  return total > 1_000 ? Math.round(total / 100) * 100 : total",
  "}",
]

export function CodeThemePreview() {
  const tokens = useHighlightedLines(CODE_THEME_SAMPLE, "typescript")
  return (
    <CodeBlock size="sm" className="bg-muted/40" aria-label="Code theme preview">
      <CodeBlockHeader>
        <CodeBlockTitle>lines.ts</CodeBlockTitle>
      </CodeBlockHeader>
      <CodeBlockContent lineNumbers className="leading-5">
        {CODE_THEME_SAMPLE.map((line, position) => (
          <CodeBlockLine key={position}>
            <CodeLine text={line} tokens={tokens?.[position]} />
          </CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  )
}
