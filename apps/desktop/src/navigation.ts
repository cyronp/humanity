/**
 * Where a URL the page wants to go may be shown:
 * - `app`: in a Humanity window (the web app itself, or a blank tab it fills with a blob).
 * - `external`: in the human's own browser or mail client.
 * - `blocked`: nowhere.
 */
export type Destination = "app" | "external" | "blocked"

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

export const destinationOf = (url: string, appOrigin: string): Destination => {
  // What `window.open("")` asks for; the web app then points it at a blob of its own.
  if (url === "" || url === "about:blank") return "app"
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return "blocked"
  }
  // A blob URL carries the origin of the page that made it.
  if (parsed.origin === appOrigin) return "app"
  return EXTERNAL_PROTOCOLS.has(parsed.protocol) ? "external" : "blocked"
}

/** The web app's address for its first load, carrying the daemon's token. */
export const appUrl = (origin: string, tokenParam: string, token: string): string =>
  `${origin}/?${tokenParam}=${encodeURIComponent(token)}`
