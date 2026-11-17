import { useEffect, useState } from "react"
import type { BundledLanguage, HighlighterCore } from "shiki"
import type { bundledLanguages } from "shiki/langs"

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

/** Code longer than this is shown as plain text: tokenizing it would hold up the page. */
export const MAX_HIGHLIGHT_LENGTH = 100_000

/** Raised for code longer than `MAX_HIGHLIGHT_LENGTH`; callers show it as plain text. */
export class CodeTooLongToHighlight extends Error {}

/** Shiki's names for plain text, which have no grammar to load. */
const PLAIN_LANGUAGES: ReadonlySet<string> = new Set(["text", "txt", "plain", "plaintext"])

interface Shiki {
  readonly highlighter: HighlighterCore
  readonly languages: typeof bundledLanguages
}

let shikiPromise: Promise<Shiki> | undefined

/**
 * Shiki's core with its JavaScript regex engine: no WebAssembly to fetch and
 * compile before the first block shows, and a pattern the engine cannot run is
 * skipped rather than failing its grammar. Shiki, the two themes and each
 * grammar are separate chunks, fetched the first time code is shown.
 */
const getShiki = (): Promise<Shiki> =>
  (shikiPromise ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/langs"),
    import("shiki/themes"),
  ]).then(
    async ([
      { createHighlighterCore },
      { createJavaScriptRegexEngine },
      { bundledLanguages: languages },
      { bundledThemes },
    ]) => ({
      highlighter: await createHighlighterCore({
        themes: [bundledThemes[SHIKI_THEMES.light], bundledThemes[SHIKI_THEMES.dark]],
        langs: [],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      }),
      languages,
    }),
  ))

/**
 * Tokenizes `code` for both themes at once. Each token's colours are exposed
 * as CSS variables, and `index.css` picks one based on the `dark` class, so
 * switching theme never re-highlights. Fails for a language Shiki does not
 * know and for code longer than `MAX_HIGHLIGHT_LENGTH`.
 */
export const highlight = async (
  code: string,
  language: BundledLanguage,
): Promise<Array<Array<CodeToken>>> => {
  if (code.length > MAX_HIGHLIGHT_LENGTH) throw new CodeTooLongToHighlight()
  const { highlighter, languages } = await getShiki()
  if (!PLAIN_LANGUAGES.has(language) && !highlighter.getLoadedLanguages().includes(language)) {
    const grammar = languages[language]
    if (grammar === undefined) throw new Error(`Shiki has no grammar for ${language}`)
    await highlighter.loadLanguage(grammar)
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
