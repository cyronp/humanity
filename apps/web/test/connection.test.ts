import { DEFAULT_DESKTOP_PORT } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { createSocketStore, retryDelayMs, startCommand, surroundingsOf } from "@/lib/connection"

describe("surroundingsOf", () => {
  it("is the dev server under Vite, whatever the port", () => {
    expect(surroundingsOf("5173", true)).toBe("dev")
  })

  it("is the desktop app on its own port", () => {
    expect(surroundingsOf(String(DEFAULT_DESKTOP_PORT), false)).toBe("desktop")
  })

  it("is a daemon started by hand anywhere else", () => {
    expect(surroundingsOf("7420", false)).toBe("daemon")
  })
})

describe("startCommand", () => {
  it("names the command that starts the daemon, except in the desktop app", () => {
    expect(startCommand("dev")).toBe("npm run dev")
    expect(startCommand("daemon")).toBe("npm start")
    expect(startCommand("desktop")).toBeUndefined()
  })
})

describe("retryDelayMs", () => {
  it("doubles from 2s and stops at 10s", () => {
    expect([1, 2, 3, 4, 10].map(retryDelayMs)).toEqual([2000, 4000, 8000, 10_000, 10_000])
  })

  it("starts at 2s before any failure", () => {
    expect(retryDelayMs(0)).toBe(2000)
  })
})

/** A socket that fires the events a test asks for. */
const fakeSocket = () => {
  const listeners = new Map<string, Array<() => void>>()
  return {
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    fire: (type: "open" | "close") => {
      for (const listener of listeners.get(type) ?? []) listener()
    },
  }
}

describe("createSocketStore", () => {
  it("follows each socket from connecting to open to lost and back", () => {
    const store = createSocketStore()
    const seen: Array<string> = []
    store.subscribe(() => seen.push(store.get()))
    expect(store.get()).toBe("connecting")

    const first = fakeSocket()
    store.watch(first)
    first.fire("open")
    first.fire("close")

    // The reconnect is a new socket.
    const second = fakeSocket()
    store.watch(second)
    second.fire("close")
    second.fire("open")

    expect(seen).toEqual(["open", "lost", "open"])
    expect(store.get()).toBe("open")
  })

  it("stops telling a listener once it unsubscribes", () => {
    const store = createSocketStore()
    let calls = 0
    const unsubscribe = store.subscribe(() => calls++)
    const socket = fakeSocket()
    store.watch(socket)
    socket.fire("open")
    unsubscribe()
    socket.fire("close")
    expect(calls).toBe(1)
  })
})
