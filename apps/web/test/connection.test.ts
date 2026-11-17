import { DEFAULT_DESKTOP_PORT } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { retryDelayMs, startCommand, surroundingsOf } from "@/lib/connection"

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
