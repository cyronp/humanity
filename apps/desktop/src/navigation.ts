export type Destination = "app" | "external" | "blocked"

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

export const destinationOf = (url: string, appOrigin: string): Destination => {
  if (url === "" || url === "about:blank") return "app"
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return "blocked"
  }
  if (parsed.origin === appOrigin) return "app"
  return EXTERNAL_PROTOCOLS.has(parsed.protocol) ? "external" : "blocked"
}

export const appUrl = (origin: string, tokenParam: string, token: string): string =>
  `${origin}/?${tokenParam}=${encodeURIComponent(token)}`
