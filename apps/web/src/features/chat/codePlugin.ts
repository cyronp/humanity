import type { BundledLanguage } from "shiki"
import type { CodeHighlighterPlugin, HighlightResult } from "streamdown"
import { highlight, SHIKI_THEMES } from "@/features/diff/highlighter"

const MAX_CACHED = 200
const cache = new Map<string, HighlightResult>()

const remember = (key: string, result: HighlightResult) => {
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, result)
}

/**
 * Streamdown's code blocks highlighted by the same Shiki instance and themes
 * as diffs. Streamdown colours a token with `color` and, under `.dark`, with
 * `--shiki-dark`, so both themes are emitted and the page's theme picks one.
 */
export const shikiCodePlugin: CodeHighlighterPlugin = {
  name: "shiki",
  type: "code-highlighter",
  getSupportedLanguages: () => [],
  getThemes: () => [SHIKI_THEMES.light, SHIKI_THEMES.dark],
  // Unknown fences fall back to plain text when their grammar fails to load.
  supportsLanguage: () => true,
  highlight: ({ code, language, isIncomplete }, callback) => {
    const key = `${language}\u0000${code}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    highlight(code, language as BundledLanguage)
      .catch(() => highlight(code, "text" as BundledLanguage))
      .then(
        (lines) => {
          const result: HighlightResult = {
            tokens: lines.map((line) =>
              line.map((token) => ({
                content: token.content,
                htmlStyle: {
                  color: token.style["--shiki-light"] ?? "inherit",
                  "--shiki-dark": token.style["--shiki-dark"] ?? "inherit",
                },
              })),
            ),
          }
          // A block still streaming is replaced by its next update; don't keep it.
          if (!isIncomplete) remember(key, result)
          callback?.(result)
        },
        () => {
          // Leave the block as plain text.
        },
      )
    return null
  },
}
