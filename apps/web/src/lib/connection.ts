import { DEFAULT_DESKTOP_PORT } from "@humanity/contracts"

declare const __HUMANITY_DEV_DAEMON__: string

export type Surroundings = "dev" | "desktop" | "daemon"

export const surroundingsOf = (port: string, dev: boolean): Surroundings => {
  if (dev) return "dev"
  return port === String(DEFAULT_DESKTOP_PORT) ? "desktop" : "daemon"
}

export const currentSurroundings = (): Surroundings =>
  surroundingsOf(window.location.port, import.meta.env.DEV)

export const daemonAddress = (): string =>
  import.meta.env.DEV && typeof __HUMANITY_DEV_DAEMON__ === "string"
    ? __HUMANITY_DEV_DAEMON__
    : window.location.host

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

export const retryDelayMs = (failures: number): number =>
  Math.min(2000 * 2 ** Math.max(0, failures - 1), 10_000)

export type SocketState = "connecting" | "open" | "lost"

interface Watchable {
  addEventListener(type: "open" | "close", listener: () => void): void
}

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
    watch: (socket: Watchable): void => {
      socket.addEventListener("open", () => set("open"))
      socket.addEventListener("close", () => set("lost"))
    },
  }
}

export const socketStore = createSocketStore()
