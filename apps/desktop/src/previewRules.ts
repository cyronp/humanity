import { DEFAULT_DAEMON_PORT, DEFAULT_DESKTOP_PORT } from "@humanity/contracts"
import { isAbsolute, join, relative, resolve } from "node:path"

const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)$/i

/** What a Browser page may do with an address it navigates to or opens. */
export type GuestDestination = "page" | "own" | "external" | "blocked"

/**
 * Where an address leads a Browser page: a web page it may show, Humanity itself (refused, whatever
 * loopback name or port of Humanity's it uses), a mail link for the human's own apps, or nothing.
 */
export const guestDestinationOf = (url: string, appOrigin: string): GuestDestination => {
  if (url === "" || url === "about:blank") return "page"
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return "blocked"
  }
  if (parsed.protocol === "mailto:") return "external"
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "blocked"
  if (parsed.origin === appOrigin) return "own"
  if (LOOPBACK.test(parsed.hostname)) {
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80))
    const app = new URL(appOrigin)
    const own = new Set([DEFAULT_DAEMON_PORT, DEFAULT_DESKTOP_PORT, Number(app.port || 80)])
    if (own.has(port)) return "own"
  }
  return "page"
}

const MAX_RECORDING_BYTES = 50 * 1024 * 1024

/** Where a thread's recording goes, under `~/.humanity/recordings/<thread>/`, or why it can't. */
export const recordingPath = (
  home: string,
  threadId: string,
  size: number,
  now: Date,
): { readonly path: string } | { readonly refused: string } => {
  if (!/^[\w-]{1,128}$/.test(threadId)) return { refused: "That is not a thread." }
  if (size <= 0) return { refused: "The recording is empty." }
  if (size > MAX_RECORDING_BYTES) return { refused: "The recording is larger than 50 MB." }
  const stamp = now.toISOString().replace(/[:.]/g, "-")
  return { path: join(home, "recordings", threadId, `${stamp}.webm`) }
}

/** Whether `path` is a file under `~/.humanity/recordings/`, the only folder Reveal shows. */
export const isRecording = (home: string, path: string): boolean => {
  const inside = relative(join(home, "recordings"), resolve(path))
  return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside)
}
