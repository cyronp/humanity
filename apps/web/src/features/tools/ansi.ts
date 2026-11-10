/** A run of terminal output with one style. */
export interface AnsiSegment {
  readonly text: string
  /** A Tailwind text colour class, if the run is coloured. */
  readonly color?: string
  readonly bold?: boolean
  readonly dim?: boolean
  readonly underline?: boolean
}

// Standard and bright foreground colours, readable in both themes.
const COLORS: Record<number, string> = {
  30: "text-zinc-500",
  31: "text-red-600 dark:text-red-400",
  32: "text-emerald-600 dark:text-emerald-400",
  33: "text-amber-600 dark:text-amber-400",
  34: "text-blue-600 dark:text-blue-400",
  35: "text-fuchsia-600 dark:text-fuchsia-400",
  36: "text-cyan-600 dark:text-cyan-400",
  37: "text-zinc-700 dark:text-zinc-300",
  90: "text-zinc-500",
  91: "text-red-500 dark:text-red-300",
  92: "text-emerald-500 dark:text-emerald-300",
  93: "text-amber-500 dark:text-amber-300",
  94: "text-blue-500 dark:text-blue-300",
  95: "text-fuchsia-500 dark:text-fuchsia-300",
  96: "text-cyan-500 dark:text-cyan-300",
  97: "text-zinc-900 dark:text-zinc-100",
}

interface Style {
  color?: string
  bold?: boolean
  dim?: boolean
  underline?: boolean
}

const applyCodes = (style: Style, codes: ReadonlyArray<number>): Style => {
  let next: Style = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i] ?? 0
    if (code === 0) next = {}
    else if (code === 1) next.bold = true
    else if (code === 2) next.dim = true
    else if (code === 4) next.underline = true
    else if (code === 22) {
      delete next.bold
      delete next.dim
    } else if (code === 24) delete next.underline
    else if (code === 39) delete next.color
    else if (COLORS[code] !== undefined) next.color = COLORS[code]
    // 256-colour and true-colour sequences carry extra parameters; skip them.
    else if (code === 38 || code === 48) i += codes[i + 1] === 5 ? 2 : 4
  }
  return next
}

// eslint-disable-next-line no-control-regex
const ESCAPE = /\u001b\[([0-9;]*)([A-Za-z])/g

/**
 * Splits terminal output into styled runs. Colour and weight (SGR) sequences
 * are honoured; every other escape sequence (cursor moves, clears) is dropped
 * so it never shows up as garbage.
 */
export const parseAnsi = (input: string): Array<AnsiSegment> => {
  const segments: Array<AnsiSegment> = []
  let style: Style = {}
  let last = 0
  const push = (text: string) => {
    if (text === "") return
    const previous = segments.at(-1)
    const same =
      previous !== undefined &&
      previous.color === style.color &&
      previous.bold === style.bold &&
      previous.dim === style.dim &&
      previous.underline === style.underline
    if (same) segments[segments.length - 1] = { ...previous, text: previous.text + text }
    else segments.push({ text, ...style })
  }
  for (const match of input.matchAll(ESCAPE)) {
    push(input.slice(last, match.index))
    last = match.index + match[0].length
    if (match[2] === "m") {
      const codes = (match[1] ?? "").split(";").map((part) => (part === "" ? 0 : Number(part)))
      style = applyCodes(style, codes)
    }
  }
  push(input.slice(last))
  return segments
}

/** Output with every escape sequence removed. */
export const stripAnsi = (input: string): string => input.replace(ESCAPE, "")
