import { afterEach, describe, expect, it, vi } from "vitest"
import { readStored, readStoredJson, writeStored, writeStoredJson } from "../src/lib/storage.ts"

const storage = () => {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

describe("browser storage", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("writes, reads and removes values as they are", () => {
    vi.stubGlobal("localStorage", storage())
    writeStored("k", "light")
    expect(readStored("k")).toBe("light")
    writeStored("k", null)
    expect(readStored("k")).toBeNull()
  })

  it("reads JSON back, and nothing from what is not JSON", () => {
    vi.stubGlobal("localStorage", storage())
    writeStoredJson("k", { open: true })
    expect(readStoredJson("k")).toEqual({ open: true })
    writeStored("k", "{broken")
    expect(readStoredJson("k")).toBeUndefined()
    expect(readStoredJson("missing")).toBeUndefined()
  })

  it("acts as empty when storage cannot be used", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("denied")
      },
      removeItem: () => {
        throw new Error("denied")
      },
    })
    expect(readStored("k")).toBeNull()
    expect(() => writeStored("k", "v")).not.toThrow()
    expect(() => writeStored("k", null)).not.toThrow()
  })
})
