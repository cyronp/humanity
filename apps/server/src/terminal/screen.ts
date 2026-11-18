import serializeModule from "@xterm/addon-serialize"
import unicodeModule from "@xterm/addon-unicode11"
import headless from "@xterm/headless"

export type HeadlessTerminal = InstanceType<typeof headless.Terminal>

/**
 * A terminal's screen as the daemon keeps it: every byte the process printed goes through a
 * headless xterm, so the screen can be handed to a browser that attaches and read by the agent.
 */
export interface Screen {
  readonly terminal: HeadlessTerminal
  /** `done` runs once xterm has parsed `data`, and the screen shows it. */
  readonly write: (data: string, done?: () => void) => void
  /** Everything on screen and in the scrollback, as the sequences that redraw it. */
  readonly serialize: () => string
  readonly resize: (cols: number, rows: number) => void
  readonly cols: () => number
  readonly rows: () => number
  /** What the terminal answers to the program's queries (cursor position, device attributes). */
  readonly onReply: (listener: (data: string) => void) => void
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
    dispose: () => terminal.dispose(),
  }
}

/** A dim line that marks where a terminal's shell was started again. */
export const restartMarker = (when: Date, reason: string) =>
  `\r\n\x1b[0m\x1b[2m── ${reason} · ${when.toLocaleString()} ──\x1b[0m\r\n`
