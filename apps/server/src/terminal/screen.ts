import serializeModule from "@xterm/addon-serialize"
import unicodeModule from "@xterm/addon-unicode11"
import type { TerminalColors } from "@humanity/contracts"
import headless from "@xterm/headless"

export type HeadlessTerminal = InstanceType<typeof headless.Terminal>

export type Marker = NonNullable<ReturnType<HeadlessTerminal["registerMarker"]>>

export interface Screen {
  readonly terminal: HeadlessTerminal
  readonly write: (data: string, done?: () => void) => void
  readonly serialize: () => string
  readonly resize: (cols: number, rows: number) => void
  readonly cols: () => number
  readonly rows: () => number
  readonly onReply: (listener: (data: string) => void) => void
  readonly onOsc: (ident: number, listener: (data: string) => void) => void
  readonly marker: () => Marker | undefined
  readonly dispose: () => void
}

const extendedColor = (index: number): readonly [number, number, number] => {
  if (index >= 232) {
    const gray = 8 + (index - 232) * 10
    return [gray, gray, gray]
  }
  const cube = index - 16
  const level = (step: number) => (step === 0 ? 0 : 55 + step * 40)
  return [level(Math.floor(cube / 36)), level(Math.floor(cube / 6) % 6), level(cube % 6)]
}

const channels = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]

const rgb = ([r, g, b]: readonly [number, number, number]) => {
  const channel = (value: number) => value.toString(16).padStart(2, "0").repeat(2)
  return `rgb:${channel(r)}/${channel(g)}/${channel(b)}`
}

const reply = (body: string) => `\x1b]${body}\x1b\\`

export const colorReplies = (
  ident: number,
  data: string,
  colors: TerminalColors | undefined,
): string => {
  if (colors === undefined) return ""
  const parts = data.split(";")
  if (ident === 4) {
    let out = ""
    for (let at = 0; at + 1 < parts.length; at += 2) {
      const index = Number(parts[at])
      if (parts[at + 1] !== "?" || !Number.isInteger(index) || index < 0 || index > 255) continue
      const ansi = colors.ansi[index]
      out += reply(`4;${index};${rgb(ansi === undefined ? extendedColor(index) : channels(ansi))}`)
    }
    return out
  }
  const special = [colors.foreground, colors.background, colors.cursor]
  let out = ""
  for (const [offset, part] of parts.entries()) {
    const hex = special[ident - 10 + offset]
    if (hex === undefined) break
    if (part === "?") out += reply(`${ident + offset};${rgb(channels(hex))}`)
  }
  return out
}

export const makeScreen = (options: {
  readonly cols: number
  readonly rows: number
  readonly scrollback: number
  readonly colors?: () => TerminalColors | undefined
}): Screen => {
  const terminal = new headless.Terminal({
    cols: options.cols,
    rows: options.rows,
    scrollback: options.scrollback,
    allowProposedApi: true,
  })
  terminal.loadAddon(new unicodeModule.Unicode11Addon())
  terminal.unicode.activeVersion = "11"
  const serializer = new serializeModule.SerializeAddon()
  terminal.loadAddon(serializer)
  for (const ident of [4, 10, 11, 12]) {
    terminal.parser.registerOscHandler(ident, (data) => {
      const answer = colorReplies(ident, data, options.colors?.())
      if (answer !== "") terminal.input(answer, false)
      return false
    })
  }
  return {
    terminal,
    write: (data, done) => terminal.write(data, done),
    serialize: () => serializer.serialize({ scrollback: options.scrollback }),
    resize: (cols, rows) => {
      if (cols !== terminal.cols || rows !== terminal.rows) terminal.resize(cols, rows)
    },
    cols: () => terminal.cols,
    rows: () => terminal.rows,
    onReply: (listener) => void terminal.onData(listener),
    onOsc: (ident, listener) =>
      void terminal.parser.registerOscHandler(ident, (data) => {
        listener(data)
        return false
      }),
    marker: () => terminal.registerMarker(0),
    dispose: () => terminal.dispose(),
  }
}

export const restartMarker = (when: Date, reason: string) =>
  `\r\n\x1b[0m\x1b[2m── ${reason} · ${when.toLocaleString()} ──\x1b[0m\r\n`
