import { DEFAULT_DAEMON_PORT, DEFAULT_DESKTOP_PORT, isLoopbackHost } from "@humanity/contracts"
import { isAbsolute, join, relative, resolve } from "node:path"

export type GuestDestination = "page" | "own" | "external" | "blocked"

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
  if (isLoopbackHost(parsed.hostname)) {
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80))
    const app = new URL(appOrigin)
    const own = new Set([DEFAULT_DAEMON_PORT, DEFAULT_DESKTOP_PORT, Number(app.port || 80)])
    if (own.has(port)) return "own"
  }
  return "page"
}

export interface GuestKey {
  readonly type: string
  readonly key: string
  readonly code: string
  readonly control: boolean
  readonly shift: boolean
  readonly alt: boolean
  readonly meta: boolean
}

export const isAppShortcut = (key: GuestKey, mac: boolean): boolean => {
  if (key.type !== "keyDown") return false
  if (key.code === "Backquote") return key.control && !key.alt && !key.meta
  if (key.key.toLowerCase() !== "f" || key.shift || key.alt) return false
  return mac ? key.meta && !key.control : key.control && !key.meta
}

const MAX_RECORDING_BYTES = 50 * 1024 * 1024

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

export const isRecording = (home: string, path: string): boolean => {
  const inside = relative(join(home, "recordings"), resolve(path))
  return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside)
}
