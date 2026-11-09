import { useEffect, useState } from "react"
import type { BundledLanguage, Highlighter } from "shiki"

/** The light and dark themes used everywhere code is shown: diffs, tool cards and chat. */
export const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const

/** One coloured run of text. `style` carries `--shiki-light` and `--shiki-dark`. */
export interface CodeToken {
  readonly content: string
  readonly style: Record<string, string>
}

const EXTENSION_LANGUAGES: Record<string, BundledLanguage> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  md: "markdown",
  mdx: "mdx",
  css: "css",
  scss: "scss",
  html: "html",
  vue: "vue",
  svelte: "svelte",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  swift: "swift",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
  xml: "xml",
  svg: "xml",
  graphql: "graphql",
  dockerfile: "docker",
  ipynb: "json",
}

/** The Shiki language for a file path, or `undefined` when it should render as plain text. */
export const languageForPath = (filePath: string): BundledLanguage | undefined => {
  const name = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? ""
  if (name === "dockerfile") return "docker"
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : ""
  return EXTENSION_LANGUAGES[extension]
}

let highlighterPromise: Promise<Highlighter> | undefined

// Shiki and each grammar are separate chunks, fetched the first time code is shown.
const getHighlighter = (): Promise<Highlighter> =>
  (highlighterPromise ??= import("shiki").then(({ createHighlighter }) =>
    createHighlighter({ themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark], langs: [] }),
  ))

/**
 * Tokenizes `code` for both themes at once. Each token's colours are exposed
 * as CSS variables, and `index.css` picks one based on the `dark` class, so
 * switching theme never re-highlights.
 */
export const highlight = async (
  code: string,
  language: BundledLanguage,
): Promise<Array<Array<CodeToken>>> => {
  const highlighter = await getHighlighter()
  if (!highlighter.getLoadedLanguages().includes(language)) {
    await highlighter.loadLanguage(language)
  }
  const { tokens } = highlighter.codeToTokens(code, {
    lang: language,
    themes: SHIKI_THEMES,
    defaultColor: false,
  })
  return tokens.map((line) =>
    line.map((token) => ({ content: token.content, style: token.htmlStyle ?? {} })),
  )
}

/**
 * Highlighted tokens for each of `lines`, or `undefined` while loading, for
 * unknown languages, or if highlighting fails. Callers render plain text then.
 */
export const useHighlightedLines = (
  lines: ReadonlyArray<string>,
  language: BundledLanguage | undefined,
): ReadonlyArray<ReadonlyArray<CodeToken>> | undefined => {
  const code = lines.join("\n")
  const [result, setResult] = useState<{
    readonly key: string
    readonly tokens: ReadonlyArray<ReadonlyArray<CodeToken>>
  }>()
  const key = `${language ?? ""}\u0000${code}`

  useEffect(() => {
    if (language === undefined) return
    let cancelled = false
    highlight(code, language).then(
      (tokens) => {
        if (!cancelled) setResult({ key, tokens })
      },
      () => {
        // A grammar that fails to load must not hide the code itself.
      },
    )
    return () => {
      cancelled = true
    }
  }, [code, language, key])

  return result?.key === key ? result.tokens : undefined
}
