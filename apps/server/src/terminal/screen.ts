import serializeModule from "@xterm/addon-serialize"
import unicodeModule from "@xterm/addon-unicode11"
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

export const makeScreen = (options: {
  readonly cols: number
  readonly rows: number
  readonly scrollback: number
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
