import { Schema } from "effect"
import { trimTrailing } from "../text.ts"
import { TerminalId } from "./Terminal.ts"

/** An address the Browser offers: a local URL a terminal or a `Bash` call printed, and when. */
export interface OfferedUrl {
  readonly url: string
  readonly seenAt: string
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"])

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[@-Z\\-_])/g

export const stripAnsi = (text: string): string => text.replace(ANSI, "")

const LOCAL_URL =
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d{1,5})?(?!\.?[\w-])(?:[/?#][^\s"'<>`]*)?/gi

const TRAILING = ".,;:!?)]}'\"*"

/** Rewrites a matched local URL the way it is offered: `0.0.0.0` becomes `localhost`. */
const normalize = (raw: string): string | undefined => {
  try {
    const url = new URL(raw)
    if (!LOCAL_HOSTS.has(url.hostname)) return undefined
    if (url.hostname === "0.0.0.0") url.hostname = "localhost"
    return url.href
  } catch {
    return undefined
  }
}

export interface UrlRange {
  readonly start: number
  readonly end: number
  readonly url: string
}

/** Where `text` (without ANSI) names a local URL, and that URL normalized. */
export const localUrlRanges = (text: string): ReadonlyArray<UrlRange> => {
  const ranges: Array<UrlRange> = []
  for (const match of text.matchAll(LOCAL_URL)) {
    const raw = trimTrailing(match[0], TRAILING)
    const url = normalize(raw)
    if (url !== undefined) ranges.push({ start: match.index, end: match.index + raw.length, url })
  }
  return ranges
}

/**
 * The local URLs `text` prints, once each, in order: `http(s)` on `localhost`, `127.0.0.1`, `[::1]`
 * or `0.0.0.0` (offered as `localhost`). LAN addresses, such as a dev server's "Network:" line,
 * are not offered.
 */
export const localUrls = (text: string): ReadonlyArray<string> => [
  ...new Set(localUrlRanges(stripAnsi(text)).map((range) => range.url)),
]

export type PreviewTarget =
  | { readonly _tag: "Url"; readonly url: string }
  | { readonly _tag: "Refused"; readonly reason: string }

const refused = (reason: string): PreviewTarget => ({ _tag: "Refused", reason })

/** The port a URL reaches, with the scheme's default when it names none. */
export const portOf = (url: URL): number =>
  url.port !== "" ? Number(url.port) : url.protocol === "https:" ? 443 : 80

/**
 * What the Browser loads for an address the human typed or clicked: `localhost:3000` and `3000`
 * become `http://localhost:3000/`. Only `localhost`, `127.0.0.1` and `[::1]` over http and https are
 * previewed, and never Humanity's own ports, so a framed page can never be Humanity itself.
 */
export const previewTarget = (
  input: string,
  refusedPorts: ReadonlySet<number>,
  options: {
    /** The desktop app's Browser shows any site; a browser tab's only local ones. */
    readonly anyHost?: boolean
  } = {},
): PreviewTarget => {
  const anyHost = options.anyHost === true
  const trimmed = input.trim()
  if (trimmed === "") {
    return refused(
      anyHost
        ? "Type an address, such as localhost:3000."
        : "Type a local address, such as localhost:3000.",
    )
  }
  const withHost = /^:?\d{1,5}(?:[/?#].*)?$/.test(trimmed)
    ? `localhost${trimmed.startsWith(":") ? "" : ":"}${trimmed}`
    : trimmed
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(withHost)
  const hostPart = withHost.split(/[/?#]/, 1)[0] ?? ""
  if (!hasScheme && (/\s/.test(withHost) || !/[.:]|^localhost$/i.test(hostPart))) {
    return refused(`"${trimmed}" is not an address. The address bar doesn't search.`)
  }
  const looksLocal = /^(?:localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(hostPart)
  const withScheme = hasScheme
    ? withHost
    : `${anyHost && !looksLocal ? "https" : "http"}://${withHost}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return refused(`"${trimmed}" is not an address.`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return refused("Only http and https addresses can be previewed.")
  }
  const local = LOCAL_HOSTS.has(url.hostname) || url.hostname.startsWith("127.")
  if (!local && !anyHost) {
    return refused("Only localhost, 127.0.0.1 and [::1] can be previewed here.")
  }
  if (url.hostname === "0.0.0.0") url.hostname = "localhost"
  if (local && refusedPorts.has(portOf(url))) {
    return refused(`Port ${portOf(url)} is Humanity's own, so it can't be previewed here.`)
  }
  return { _tag: "Url", url: url.href }
}

/**
 * Merges what each source offers into one list, newest first and once per URL, keeping the latest
 * time a URL was seen.
 */
export const mergeOffers = (
  ...sources: ReadonlyArray<ReadonlyArray<OfferedUrl>>
): ReadonlyArray<OfferedUrl> => {
  const latest = new Map<string, string>()
  for (const offer of sources.flat()) {
    const seen = latest.get(offer.url)
    if (seen === undefined || offer.seenAt > seen) latest.set(offer.url, offer.seenAt)
  }
  return [...latest]
    .map(([url, seenAt]) => ({ url, seenAt }))
    .sort((a, b) => (a.seenAt < b.seenAt ? 1 : a.seenAt > b.seenAt ? -1 : 0))
}

/** A server listening on this machine that answers HTTP, and the terminal that started it. */
export const LocalServer = Schema.Struct({
  port: Schema.Int,
  url: Schema.String,
  pid: Schema.Int,
  processName: Schema.NullOr(Schema.String),
  terminalId: Schema.NullOr(TerminalId),
})
export type LocalServer = typeof LocalServer.Type

/** What the daemon found when it loaded a framed address itself. */
export const PreviewProbe = Schema.TaggedUnion({
  Ok: { status: Schema.Int },
  Unreachable: { reason: Schema.String },
  Refuses: { reason: Schema.String },
})
export type PreviewProbe = typeof PreviewProbe.Type

/** Files the Browser shows from a thread's folder. */
export const isPreviewFile = (path: string): boolean => /\.(?:html?|pdf)$/i.test(path)

export interface PreviewDevice {
  readonly id: string
  readonly label: string
  readonly category: "Phone" | "Tablet" | "Desktop"
  readonly width: number
  readonly height: number
}

/** Chrome DevTools' devices, in its order, with their CSS viewport sizes (portrait). */
export const PREVIEW_DEVICES: ReadonlyArray<PreviewDevice> = [
  { id: "iphone-se", label: "iPhone SE", category: "Phone", width: 375, height: 667 },
  { id: "iphone-xr", label: "iPhone XR", category: "Phone", width: 414, height: 896 },
  { id: "iphone-12-pro", label: "iPhone 12 Pro", category: "Phone", width: 390, height: 844 },
  {
    id: "iphone-14-pro-max",
    label: "iPhone 14 Pro Max",
    category: "Phone",
    width: 430,
    height: 932,
  },
  { id: "pixel-7", label: "Pixel 7", category: "Phone", width: 412, height: 915 },
  { id: "galaxy-s8-plus", label: "Samsung Galaxy S8+", category: "Phone", width: 360, height: 740 },
  {
    id: "galaxy-s20-ultra",
    label: "Samsung Galaxy S20 Ultra",
    category: "Phone",
    width: 412,
    height: 915,
  },
  { id: "galaxy-a51", label: "Samsung Galaxy A51/71", category: "Phone", width: 412, height: 914 },
  { id: "galaxy-z-fold-5", label: "Galaxy Z Fold 5", category: "Phone", width: 344, height: 882 },
  { id: "surface-duo", label: "Surface Duo", category: "Tablet", width: 540, height: 720 },
  { id: "ipad-mini", label: "iPad Mini", category: "Tablet", width: 768, height: 1024 },
  { id: "ipad-air", label: "iPad Air", category: "Tablet", width: 820, height: 1180 },
  { id: "ipad-pro", label: "iPad Pro", category: "Tablet", width: 1024, height: 1366 },
  { id: "surface-pro-7", label: "Surface Pro 7", category: "Tablet", width: 912, height: 1368 },
  { id: "zenbook-fold", label: "Asus Zenbook Fold", category: "Tablet", width: 853, height: 1280 },
  { id: "nest-hub", label: "Nest Hub", category: "Desktop", width: 1024, height: 600 },
  { id: "nest-hub-max", label: "Nest Hub Max", category: "Desktop", width: 1280, height: 800 },
  { id: "laptop", label: "Laptop", category: "Desktop", width: 1366, height: 768 },
  { id: "desktop-hd", label: "Desktop HD", category: "Desktop", width: 1920, height: 1080 },
]

export const VIEWPORT_LIMITS = { min: 240, max: 3840 } as const

/** How a Browser tab sizes its page: the panel's size, a device's, or a free size. */
export type PreviewViewport =
  | { readonly _tag: "fill" }
  | { readonly _tag: "device"; readonly id: string; readonly landscape: boolean }
  | { readonly _tag: "free"; readonly width: number; readonly height: number }

export const FILL_VIEWPORT: PreviewViewport = { _tag: "fill" }

const clampDimension = (value: number) =>
  Math.round(Math.min(VIEWPORT_LIMITS.max, Math.max(VIEWPORT_LIMITS.min, value)))

/** A free size within the limits. */
export const freeViewport = (width: number, height: number): PreviewViewport => ({
  _tag: "free",
  width: clampDimension(width),
  height: clampDimension(height),
})

/** The CSS size a viewport gives its page, or undefined when it fills the panel. */
export const viewportSize = (
  viewport: PreviewViewport,
): { readonly width: number; readonly height: number } | undefined => {
  switch (viewport._tag) {
    case "fill":
      return undefined
    case "free":
      return { width: viewport.width, height: viewport.height }
    case "device": {
      const device = PREVIEW_DEVICES.find((each) => each.id === viewport.id)
      if (device === undefined) return undefined
      return viewport.landscape
        ? { width: device.height, height: device.width }
        : { width: device.width, height: device.height }
    }
  }
}

/** Reads a stored viewport, falling back to filling the panel. */
export const parseViewport = (value: unknown): PreviewViewport => {
  if (typeof value !== "object" || value === null) return FILL_VIEWPORT
  const record = value as Record<string, unknown>
  if (record["_tag"] === "device" && PREVIEW_DEVICES.some((device) => device.id === record["id"])) {
    return { _tag: "device", id: String(record["id"]), landscape: record["landscape"] === true }
  }
  if (
    record["_tag"] === "free" &&
    typeof record["width"] === "number" &&
    typeof record["height"] === "number"
  ) {
    return freeViewport(record["width"], record["height"])
  }
  return FILL_VIEWPORT
}

/** Chromium's zoom steps, up to 300 %. */
export const ZOOM_LEVELS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3,
] as const

/** The next zoom step in a direction, from any zoom. */
export const stepZoom = (zoom: number, direction: 1 | -1): number => {
  if (direction > 0) return ZOOM_LEVELS.find((level) => level > zoom + 0.001) ?? zoom
  return [...ZOOM_LEVELS].reverse().find((level) => level < zoom - 0.001) ?? zoom
}

export const parseZoom = (value: unknown): number =>
  typeof value === "number" && ZOOM_LEVELS.some((level) => level === value) ? value : 1

/**
 * How a page of `size` CSS pixels at `zoom` is shown in `available` pixels: the frame's CSS size
 * and the scale it is drawn at. A page that fills the panel takes its size; a fixed size is scaled
 * down, never up, to fit.
 */
export const fitViewport = (
  size: { readonly width: number; readonly height: number } | undefined,
  available: { readonly width: number; readonly height: number },
  zoom: number,
): { readonly width: number; readonly height: number; readonly scale: number } => {
  if (size === undefined) {
    return { width: available.width / zoom, height: available.height / zoom, scale: zoom }
  }
  const fit = Math.min(1, available.width / size.width, available.height / size.height)
  return { width: size.width / zoom, height: size.height / zoom, scale: zoom * Math.max(fit, 0.05) }
}
