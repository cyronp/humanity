import {
  DEFAULT_DAEMON_PORT,
  DEFAULT_DESKTOP_PORT,
  localUrlRanges,
  localUrls,
  type OfferedUrl,
  type ToolCall,
} from "@humanity/contracts"
import { bashOutput } from "@/features/tools/inputs"

/**
 * Humanity's own ports, whatever host names them: the page's, the daemon's and the defaults. A
 * framed page with scripts and its own origin is only safe because it can never be Humanity.
 */
export const refusedPorts = (location: Pick<Location, "port" | "protocol">, daemon: string) => {
  const ports = new Set<number>([DEFAULT_DAEMON_PORT, DEFAULT_DESKTOP_PORT])
  ports.add(
    location.port !== "" ? Number(location.port) : location.protocol === "https:" ? 443 : 80,
  )
  const daemonPort = /:(\d+)$/.exec(daemon)?.[1]
  if (daemonPort !== undefined) ports.add(Number(daemonPort))
  return ports
}

const SHELL_TOOLS = new Set(["Bash", "PowerShell"])

/** What a thread's `Bash` calls printed that the Browser can offer. */
export const bashOffers = (toolCalls: Iterable<ToolCall>): ReadonlyArray<OfferedUrl> => {
  const offers: Array<OfferedUrl> = []
  for (const call of toolCalls) {
    if (!SHELL_TOOLS.has(call.toolName)) continue
    const structured = bashOutput(call)
    const text =
      structured !== undefined
        ? `${structured.stdout}\n${structured.stderr}`
        : (call.output?.content ?? "")
    const seenAt = call.finishedAt ?? call.startedAt
    for (const url of localUrls(text)) offers.push({ url, seenAt })
  }
  return offers
}

/** What the Browser remembers of a thread: the address it showed, and the offers already seen. */
export interface BrowserMemory {
  readonly url: string | null
  readonly seen: ReadonlyArray<string>
}

const SEEN_KEPT = 50

export const EMPTY_MEMORY: BrowserMemory = { url: null, seen: [] }

export const browserKey = (sessionId: string) => `humanity.browser.${sessionId}`

export const parseMemory = (raw: string | null): BrowserMemory => {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null")
    if (typeof parsed !== "object" || parsed === null) return EMPTY_MEMORY
    const { url, seen } = parsed as Record<string, unknown>
    return {
      url: typeof url === "string" ? url : null,
      seen: Array.isArray(seen)
        ? seen.filter((each): each is string => typeof each === "string").slice(-SEEN_KEPT)
        : [],
    }
  } catch {
    return EMPTY_MEMORY
  }
}

export const readMemory = (sessionId: string): BrowserMemory => {
  try {
    return parseMemory(localStorage.getItem(browserKey(sessionId)))
  } catch {
    return EMPTY_MEMORY
  }
}

export const storeMemory = (sessionId: string, memory: BrowserMemory) => {
  try {
    localStorage.setItem(browserKey(sessionId), JSON.stringify(memory))
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the Browser still works.
  }
}

/** The memory with every offer marked seen, or the same memory when none is new. */
export const markSeen = (
  memory: BrowserMemory,
  offers: ReadonlyArray<OfferedUrl>,
): BrowserMemory => {
  const fresh = offers.map((offer) => offer.url).filter((url) => !memory.seen.includes(url))
  return fresh.length === 0
    ? memory
    : { ...memory, seen: [...memory.seen, ...fresh].slice(-SEEN_KEPT) }
}

export const hasUnseen = (memory: BrowserMemory, offers: ReadonlyArray<OfferedUrl>) =>
  offers.some((offer) => !memory.seen.includes(offer.url))

/** A piece of a text, with the local URL it belongs to, if any. */
export interface LinkPiece<T> {
  readonly segment: T
  readonly text: string
  readonly url: string | undefined
}

/**
 * Splits styled segments where local URLs start and end, across segments: a dev server that colors
 * its port still prints one address.
 */
export const linkLocalUrls = <T extends { readonly text: string }>(
  segments: ReadonlyArray<T>,
): ReadonlyArray<ReadonlyArray<LinkPiece<T>>> => {
  const ranges = localUrlRanges(segments.map((segment) => segment.text).join(""))
  let offset = 0
  return segments.map((segment) => {
    const start = offset
    const end = start + segment.text.length
    offset = end
    const pieces: Array<LinkPiece<T>> = []
    let at = start
    for (const range of ranges) {
      if (range.end <= at || range.start >= end) continue
      if (range.start > at) {
        pieces.push({
          segment,
          text: segment.text.slice(at - start, range.start - start),
          url: undefined,
        })
      }
      const to = Math.min(range.end, end)
      pieces.push({
        segment,
        text: segment.text.slice(Math.max(range.start, at) - start, to - start),
        url: range.url,
      })
      at = to
    }
    if (at < end) pieces.push({ segment, text: segment.text.slice(at - start), url: undefined })
    return pieces
  })
}

export interface PreviewRequest {
  readonly url: string
  readonly nonce: number
}

let pending: PreviewRequest | undefined
let nonce = 0
const listeners = new Set<(request: PreviewRequest) => void>()

/**
 * Asks the open thread's Browser to show `url`. Returns false when the page has no Browser, so the
 * caller can open it elsewhere.
 */
export const requestPreview = (url: string): boolean => {
  if (listeners.size === 0) return false
  const request = { url, nonce: ++nonce }
  pending = request
  for (const listener of listeners) listener(request)
  return true
}

export const onPreviewRequest = (listener: (request: PreviewRequest) => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** The request no Browser took yet, taken: a Browser that opens for it shows it. */
export const takePreviewRequest = (): PreviewRequest | undefined => {
  const request = pending
  pending = undefined
  return request
}
