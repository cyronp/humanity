import { trimTrailing } from "../text.ts"

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
export const previewTarget = (input: string, refusedPorts: ReadonlySet<number>): PreviewTarget => {
  const trimmed = input.trim()
  if (trimmed === "") return refused("Type a local address, such as localhost:3000.")
  const withHost = /^:?\d{1,5}(?:[/?#].*)?$/.test(trimmed)
    ? `localhost${trimmed.startsWith(":") ? "" : ":"}${trimmed}`
    : trimmed
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(withHost) ? withHost : `http://${withHost}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return refused(`"${trimmed}" is not an address.`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return refused("Only http and https addresses can be previewed.")
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    return refused("Only localhost, 127.0.0.1 and [::1] can be previewed here.")
  }
  if (url.hostname === "0.0.0.0") url.hostname = "localhost"
  if (refusedPorts.has(portOf(url))) {
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
