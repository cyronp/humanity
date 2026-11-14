import { describe, expect, it } from "vitest"
import { describeUpdate, isUpdating } from "@/features/updates/describe"

const at = (iso: string) => `at:${iso}`

describe("describeUpdate", () => {
  it("passes on why updates are unavailable", () => {
    expect(describeUpdate({ _tag: "Unsupported", reason: "Use the desktop app." }, at)).toBe(
      "Use the desktop app.",
    )
  })

  it("says when it last checked", () => {
    expect(describeUpdate({ _tag: "UpToDate", checkedAt: "T" }, at)).toBe(
      "Humanity is up to date. Checked at at:T.",
    )
  })

  it("rounds the download down, so it never reads 100% before it is done", () => {
    expect(describeUpdate({ _tag: "Downloading", version: "0.3.0", percent: 99.7 }, at)).toBe(
      "Downloading version 0.3.0: 99%.",
    )
  })

  it("names the version that is ready", () => {
    expect(describeUpdate({ _tag: "Available", version: "0.3.0", checkedAt: "T" }, at)).toContain(
      "0.3.0",
    )
  })
})

describe("isUpdating", () => {
  it("is true only while downloading or installing", () => {
    expect(isUpdating({ _tag: "Downloading", version: "1", percent: 0 })).toBe(true)
    expect(isUpdating({ _tag: "Installing", version: "1" })).toBe(true)
    expect(isUpdating({ _tag: "Available", version: "1", checkedAt: "T" })).toBe(false)
    expect(isUpdating({ _tag: "Idle" })).toBe(false)
  })
})
