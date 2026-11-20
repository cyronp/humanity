import {
  type BrowserLinkTarget,
  DEFAULT_DAEMON_PORT,
  DEFAULT_DESKTOP_PORT,
  localUrlRanges,
  localUrls,
  FILL_VIEWPORT,
  type OfferedUrl,
  parseViewport,
  parseZoom,
  type PreviewViewport,
  type ToolCall,
} from "@humanity/contracts"
import { bashOutput } from "@/features/tools/inputs"

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

export interface BrowserTab {
  readonly id: string
  readonly url: string | null
  readonly title: string | null
  readonly viewport: PreviewViewport
  readonly zoom: number
}

export interface BrowserMemory {
  readonly tabs: ReadonlyArray<BrowserTab>
  readonly active: string | null
  readonly seen: ReadonlyArray<string>
}

const SEEN_KEPT = 50
const TABS_KEPT = 20

export const EMPTY_MEMORY: BrowserMemory = { tabs: [], active: null, seen: [] }

export const browserKey = (sessionId: string) => `humanity.browser.${sessionId}`

export const makeTab = (url: string | null = null): BrowserTab => ({
  id: crypto.randomUUID(),
  url,
  title: null,
  viewport: FILL_VIEWPORT,
  zoom: 1,
})

const parseTab = (value: unknown): BrowserTab | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record["id"] !== "string") return undefined
  return {
    id: record["id"],
    url: typeof record["url"] === "string" ? record["url"] : null,
    title: typeof record["title"] === "string" ? record["title"] : null,
    viewport: parseViewport(record["viewport"]),
    zoom: parseZoom(record["zoom"]),
  }
}

export const parseMemory = (raw: string | null): BrowserMemory => {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null")
    if (typeof parsed !== "object" || parsed === null) return EMPTY_MEMORY
    const record = parsed as Record<string, unknown>
    const seen = Array.isArray(record["seen"])
      ? record["seen"].filter((each): each is string => typeof each === "string").slice(-SEEN_KEPT)
      : []
    const tabs = Array.isArray(record["tabs"])
      ? record["tabs"].flatMap((each) => parseTab(each) ?? []).slice(0, TABS_KEPT)
      : typeof record["url"] === "string"
        ? [makeTab(record["url"])]
        : []
    const active = tabs.some((tab) => tab.id === record["active"])
      ? (record["active"] as string)
      : (tabs[0]?.id ?? null)
    return { tabs, active, seen }
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
  } catch {}
}

export const activeTab = (memory: BrowserMemory): BrowserTab | undefined =>
  memory.tabs.find((tab) => tab.id === memory.active)

export const openUrl = (memory: BrowserMemory, url: string): BrowserMemory => {
  const showing = memory.tabs.find((tab) => tab.url === url)
  if (showing !== undefined) return { ...memory, active: showing.id }
  const current = activeTab(memory)
  if (current !== undefined && current.url === null) {
    return updateTab(memory, current.id, { url, title: null })
  }
  return openTab(memory, url)
}

export const openTab = (memory: BrowserMemory, url: string | null = null): BrowserMemory => {
  const tab = makeTab(url)
  return { ...memory, tabs: [...memory.tabs, tab].slice(-TABS_KEPT), active: tab.id }
}

export const closeTab = (memory: BrowserMemory, id: string): BrowserMemory => {
  const index = memory.tabs.findIndex((tab) => tab.id === id)
  if (index < 0) return memory
  const tabs = memory.tabs.filter((tab) => tab.id !== id)
  const active =
    memory.active === id ? (tabs[index]?.id ?? tabs[index - 1]?.id ?? null) : memory.active
  return { ...memory, tabs, active }
}

export const updateTab = (
  memory: BrowserMemory,
  id: string,
  patch: Partial<Omit<BrowserTab, "id">>,
): BrowserMemory => ({
  ...memory,
  tabs: memory.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
})

export const tabLabel = (tab: BrowserTab): string => {
  if (tab.title !== null && tab.title.trim() !== "") return tab.title
  if (tab.url === null) return "New tab"
  try {
    const url = new URL(tab.url)
    const path = url.pathname === "/" ? "" : url.pathname
    return `${url.host}${path}`
  } catch {
    return tab.url
  }
}

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

export interface LinkPiece<T> {
  readonly segment: T
  readonly text: string
  readonly url: string | undefined
}

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
let linkTarget: BrowserLinkTarget = "browser"
const openers = new Set<() => void>()
const takers = new Set<() => void>()

export const setLinkTarget = (target: BrowserLinkTarget) => {
  linkTarget = target
}

export const requestPreview = (
  url: string,
  options: { readonly explicit?: boolean } = {},
): boolean => {
  if (options.explicit !== true && linkTarget === "system") return false
  if (openers.size === 0) return false
  pending = { url, nonce: ++nonce }
  for (const opener of openers) opener()
  for (const taker of takers) taker()
  return true
}

export const onPreviewOpen = (listener: () => void) => {
  openers.add(listener)
  return () => void openers.delete(listener)
}

export const onPreviewPending = (listener: () => void) => {
  takers.add(listener)
  return () => void takers.delete(listener)
}

export const takePreviewRequest = (): PreviewRequest | undefined => {
  const request = pending
  pending = undefined
  return request
}
