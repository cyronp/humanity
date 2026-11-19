import { useAtomSet, useAtomSubscribe } from "@effect/atom-react"
import {
  localUrls,
  type TerminalAttachEvent,
  type TerminalId,
  type TerminalInfo,
} from "@humanity/contracts"
import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import { Unicode11Addon } from "@xterm/addon-unicode11"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { WebglAddon } from "@xterm/addon-webgl"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { requestPreview } from "@/features/browser/browser"
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  ackTerminalAtom,
  attachAtom,
  attachKey,
  resizeTerminalAtom,
  writeTerminalAtom,
} from "./atoms.ts"
import { isMac, type TerminalCommand, terminalCommand } from "./keys.ts"
import { TERMINAL_FONT_FAMILY, terminalTheme, useResolvedTheme } from "./theme.ts"

const ACK_DELAY_MS = 40

export interface TerminalViewHandle {
  readonly focus: () => void
  readonly clear: () => void
  readonly selectAll: () => void
  readonly copySelection: () => Promise<void>
  readonly paste: (text: string) => void
  readonly search: SearchAddon | undefined
}

const silenceQueries = (terminal: Terminal) => {
  const handled = () => true
  const { parser } = terminal
  parser.registerCsiHandler({ final: "c" }, handled)
  parser.registerCsiHandler({ prefix: ">", final: "c" }, handled)
  parser.registerCsiHandler({ prefix: "=", final: "c" }, handled)
  parser.registerCsiHandler({ final: "n" }, handled)
  parser.registerCsiHandler({ prefix: "?", final: "n" }, handled)
  parser.registerCsiHandler({ intermediates: "$", final: "p" }, handled)
  parser.registerCsiHandler({ prefix: "?", intermediates: "$", final: "p" }, handled)
  parser.registerCsiHandler({ prefix: ">", final: "q" }, handled)
  parser.registerCsiHandler({ prefix: "?", final: "u" }, handled)
  parser.registerDcsHandler({ intermediates: "$", final: "q" }, handled)
  for (const color of [4, 10, 11, 12]) {
    parser.registerOscHandler(color, (data) => data.includes("?"))
  }
}

const setOptions = (terminal: Terminal, options: Partial<Terminal["options"]>) => {
  Object.assign(terminal.options, options)
}

interface Mounted {
  readonly terminal: Terminal
  readonly fit: FitAddon
  readonly search: SearchAddon
}

export function TerminalView({
  info,
  active,
  fontSize,
  scrollback,
  onCommand,
  onContextMenu,
  ref,
}: {
  readonly info: TerminalInfo
  readonly active: boolean
  readonly fontSize: number
  readonly scrollback: number
  readonly onCommand: (command: TerminalCommand) => void
  readonly onContextMenu: (at: { readonly x: number; readonly y: number }) => void
  readonly ref?: Ref<TerminalViewHandle>
}) {
  const container = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState<Mounted | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const theme = useResolvedTheme()
  const onCommandRef = useRef(onCommand)
  useLayoutEffect(() => {
    onCommandRef.current = onCommand
  })

  const write = useAtomSet(writeTerminalAtom, { mode: "promiseExit" })
  const resize = useAtomSet(resizeTerminalAtom, { mode: "promiseExit" })
  const terminalId = info.id

  const outbox = useRef({ pending: "", sending: false })
  const send = useCallback(
    (data: string) => {
      const box = outbox.current
      box.pending += data
      const flush = () => {
        if (box.sending || box.pending === "") return
        const chunk = box.pending
        box.pending = ""
        box.sending = true
        void write({ payload: { terminalId, data: chunk } }).finally(() => {
          box.sending = false
          flush()
        })
      }
      flush()
    },
    [terminalId, write],
  )

  useEffect(() => {
    const element = container.current
    if (element === null) return
    const terminal = new Terminal({
      allowProposedApi: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize,
      scrollback,
      cursorBlink: true,
      macOptionIsMeta: false,
      theme: terminalTheme(element, theme),
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(search)
    terminal.loadAddon(new Unicode11Addon())
    terminal.unicode.activeVersion = "11"
    silenceQueries(terminal)
    terminal.loadAddon(
      new WebLinksAddon((event, uri) => {
        const outside = () => void window.open(uri, "_blank", "noopener,noreferrer")
        if (event.ctrlKey || event.metaKey || event.button === 1) outside()
        else if (localUrls(uri).length > 0 && !requestPreview(uri)) outside()
      }),
    )
    terminal.open(element)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      terminal.loadAddon(webgl)
    } catch {}
    const mac = isMac()
    terminal.attachCustomKeyEventHandler((event) => {
      const command = terminalCommand(event, { mac, hasSelection: terminal.hasSelection() })
      if (command === undefined) return true
      if (event.type !== "keydown") return false
      switch (command) {
        case "paste":
          return false
        case "copy":
          event.preventDefault()
          void navigator.clipboard.writeText(terminal.getSelection())
          return false
        case "select-all":
          event.preventDefault()
          terminal.selectAll()
          return false
        case "find":
          event.preventDefault()
          onCommandRef.current("find")
          return false
        default:
          return false
      }
    })
    if (element.offsetWidth > 0) fit.fit()
    setMounted({ terminal, fit, search })
    setKey(
      attachKey({
        terminalId,
        attachmentId: crypto.randomUUID(),
        cols: terminal.cols,
        rows: terminal.rows,
      }),
    )
    return () => {
      setMounted(null)
      terminal.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId])

  const replaying = useRef(false)

  useEffect(() => {
    if (mounted === null) return
    const input = mounted.terminal.onData((data) => {
      if (!replaying.current) send(data)
    })
    const binary = mounted.terminal.onBinary((data) => {
      if (!replaying.current) send(data)
    })
    const resized = mounted.terminal.onResize(({ cols, rows }) => {
      void resize({ payload: { terminalId, cols, rows } })
    })
    return () => {
      input.dispose()
      binary.dispose()
      resized.dispose()
    }
  }, [mounted, send, resize, terminalId])

  useEffect(() => {
    if (mounted === null || container.current === null) return
    setOptions(mounted.terminal, { theme: terminalTheme(container.current, theme) })
  }, [mounted, theme])

  useEffect(() => {
    if (mounted === null) return
    setOptions(mounted.terminal, { fontSize })
    if (container.current !== null && container.current.offsetWidth > 0) mounted.fit.fit()
  }, [mounted, fontSize])

  useEffect(() => {
    const element = container.current
    if (mounted === null || element === null || !active) return
    let frame = 0
    const refit = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (element.offsetWidth > 0 && element.offsetHeight > 0) mounted.fit.fit()
      })
    }
    refit()
    mounted.terminal.focus()
    const observer = new ResizeObserver(refit)
    observer.observe(element)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [mounted, active])

  useImperativeHandle(
    ref,
    () => ({
      focus: () => mounted?.terminal.focus(),
      clear: () => mounted?.terminal.clear(),
      selectAll: () => mounted?.terminal.selectAll(),
      copySelection: async () => {
        const selection = mounted?.terminal.getSelection() ?? ""
        if (selection !== "") await navigator.clipboard.writeText(selection)
      },
      paste: (text) => mounted?.terminal.paste(text),
      search: mounted?.search,
    }),
    [mounted],
  )

  return (
    <div
      className={cn("absolute inset-0 py-1 pl-3", !active && "invisible")}
      aria-hidden={!active}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <div ref={container} className="size-full" />
      {mounted !== null && key !== null && (
        <Attachment
          key={key}
          attachment={key}
          terminal={mounted.terminal}
          terminalId={terminalId}
          replayingRef={replaying}
        />
      )}
    </div>
  )
}

function Attachment({
  attachment,
  terminal,
  terminalId,
  replayingRef,
}: {
  readonly attachment: string
  readonly terminal: Terminal
  readonly terminalId: TerminalId
  readonly replayingRef: { current: boolean }
}) {
  const ack = useAtomSet(ackTerminalAtom, { mode: "promiseExit" })
  const attachmentId = (JSON.parse(attachment) as { attachmentId: string }).attachmentId
  const pendingAck = useRef<{ seq: number; timer: ReturnType<typeof setTimeout> | undefined }>({
    seq: 0,
    timer: undefined,
  })

  useEffect(() => {
    const pending = pendingAck.current
    return () => clearTimeout(pending.timer)
  }, [])

  const acknowledge = useCallback(
    (seq: number) => {
      const pending = pendingAck.current
      pending.seq = Math.max(pending.seq, seq)
      pending.timer ??= setTimeout(() => {
        pending.timer = undefined
        void ack({ payload: { terminalId, attachmentId, seq: pending.seq } })
      }, ACK_DELAY_MS)
    },
    [ack, terminalId, attachmentId],
  )

  const onEvent = useCallback(
    (result: AsyncResult.AsyncResult<TerminalAttachEvent, unknown>) => {
      if (!AsyncResult.isSuccess(result)) return
      const event = result.value
      switch (event._tag) {
        case "Snapshot":
          replayingRef.current = true
          terminal.reset()
          terminal.write(event.data, () => {
            replayingRef.current = false
            acknowledge(event.seq)
          })
          return
        case "Output":
          terminal.write(event.data, () => acknowledge(event.seq))
          return
        case "Exited":
          return
      }
    },
    [terminal, acknowledge, replayingRef],
  )

  useAtomSubscribe(attachAtom(attachment), onEvent)
  return null
}
