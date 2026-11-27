import { useEffect, useState } from "react"
import type { BundledLanguage, HighlighterCore } from "shiki"
import type { bundledLanguages } from "shiki/langs"
import type { bundledThemes } from "shiki/themes"
import { CODE_THEMES, type CodeThemeId, uiPreferences, useUiPreferences } from "@/lib/uiPreferences"

export const shikiThemes = (id: CodeThemeId = uiPreferences().codeTheme) => {
  const { light, dark } = CODE_THEMES[id]
  return { light, dark }
}

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

export const languageForPath = (filePath: string): BundledLanguage | undefined => {
  const name = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? ""
  if (name === "dockerfile") return "docker"
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : ""
  return EXTENSION_LANGUAGES[extension]
}

export const MAX_HIGHLIGHT_LENGTH = 100_000

export class CodeTooLongToHighlight extends Error {}

const PLAIN_LANGUAGES: ReadonlySet<string> = new Set(["text", "txt", "plain", "plaintext"])

interface Shiki {
  readonly highlighter: HighlighterCore
  readonly languages: typeof bundledLanguages
  readonly themes: typeof bundledThemes
}

let shikiPromise: Promise<Shiki> | undefined

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
        themes: [],
        langs: [],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      }),
      languages,
      themes: bundledThemes,
    }),
  ))

export const highlight = async (
  code: string,
  language: BundledLanguage,
): Promise<Array<Array<CodeToken>>> => {
  if (code.length > MAX_HIGHLIGHT_LENGTH) throw new CodeTooLongToHighlight()
  const { highlighter, languages, themes } = await getShiki()
  const pair = shikiThemes()
  for (const name of [pair.light, pair.dark]) {
    if (!highlighter.getLoadedThemes().includes(name)) await highlighter.loadTheme(themes[name])
  }
  if (!PLAIN_LANGUAGES.has(language) && !highlighter.getLoadedLanguages().includes(language)) {
    const grammar = languages[language]
    if (grammar === undefined) throw new Error(`Shiki has no grammar for ${language}`)
    await highlighter.loadLanguage(grammar)
  }
  const { tokens } = highlighter.codeToTokens(code, {
    lang: language,
    themes: pair,
    defaultColor: false,
  })
  return tokens.map((line) =>
    line.map((token) => ({ content: token.content, style: token.htmlStyle ?? {} })),
  )
}

export const useHighlightedLines = (
  lines: ReadonlyArray<string>,
  language: BundledLanguage | undefined,
): ReadonlyArray<ReadonlyArray<CodeToken>> | undefined => {
  const code = lines.join("\n")
  const [{ codeTheme }] = useUiPreferences()
  const [result, setResult] = useState<{
    readonly key: string
    readonly tokens: ReadonlyArray<ReadonlyArray<CodeToken>>
  }>()
  const key = `${codeTheme}\u0000${language ?? ""}\u0000${code}`

  useEffect(() => {
    if (language === undefined) return
    let cancelled = false
    highlight(code, language).then(
      (tokens) => {
        if (!cancelled) setResult({ key, tokens })
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [code, language, key])

  return result?.key === key ? result.tokens : undefined
}
