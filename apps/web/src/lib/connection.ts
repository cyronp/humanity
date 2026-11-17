import { DEFAULT_DESKTOP_PORT } from "@humanity/contracts"

/** Where the daemon listens under `npm run dev`, put in by Vite; the page's own host otherwise. */
declare const __HUMANITY_DEV_DAEMON__: string

/** What serves the page, which decides how a daemon that is down gets started again. */
export type Surroundings = "dev" | "desktop" | "daemon"

/**
 * Vite's dev server, the desktop app (which always uses its own port), or a
 * daemon started by hand with `npm start`.
 */
export const surroundingsOf = (port: string, dev: boolean): Surroundings => {
  if (dev) return "dev"
  return port === String(DEFAULT_DESKTOP_PORT) ? "desktop" : "daemon"
}

export const currentSurroundings = (): Surroundings =>
  surroundingsOf(window.location.port, import.meta.env.DEV)

/** The address the daemon was looked for at, as the human would type it. */
export const daemonAddress = (): string =>
  import.meta.env.DEV && typeof __HUMANITY_DEV_DAEMON__ === "string"
    ? __HUMANITY_DEV_DAEMON__
    : window.location.host

/** The command that starts the daemon, or `undefined` where the app starts it itself. */
export const startCommand = (surroundings: Surroundings): string | undefined => {
  switch (surroundings) {
    case "dev":
      return "npm run dev"
    case "daemon":
      return "npm start"
    case "desktop":
      return undefined
  }
}

/**
 * How long to wait before looking for the daemon again, by how many looks in a
 * row found nothing: 2s, 4s, 8s, then every 10s.
 */
export const retryDelayMs = (failures: number): number =>
  Math.min(2000 * 2 ** Math.max(0, failures - 1), 10_000)

/** Where the RPC socket stands, once the app is past the connect screen. */
export type SocketState = "connecting" | "open" | "lost"

interface Watchable {
  addEventListener(type: "open" | "close", listener: () => void): void
}

/**
 * The state of the app's RPC socket, as an external store for
 * `useSyncExternalStore`. The socket reconnects by itself; this only tells the
 * UI whether it is currently through.
 */
export const createSocketStore = () => {
  let state: SocketState = "connecting"
  const listeners = new Set<() => void>()
  const set = (next: SocketState) => {
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  return {
    get: (): SocketState => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Follows one socket; every reconnect makes a new one. */
    watch: (socket: Watchable): void => {
      socket.addEventListener("open", () => set("open"))
      socket.addEventListener("close", () => set("lost"))
    },
  }
}

export const socketStore = createSocketStore()
