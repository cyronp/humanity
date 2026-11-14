import { describe, expect, it } from "vitest"
import { backdropColor, splashUrl } from "../src/splash.ts"

const mark = '<svg viewBox="0 0 24 24"><path d="M0 0h1v1h-1z"/></svg>'
const pageOf = (url: string) => decodeURIComponent(url.slice(url.indexOf(",") + 1))

describe("splashUrl", () => {
  it("is a page of its own, with the mark and nothing to read", () => {
    const url = splashUrl(mark, true)
    expect(url.startsWith("data:text/html;charset=utf-8,")).toBe(true)
    expect(pageOf(url)).toContain(`<body>${mark}</body>`)
  })

  it("sits on the sidebar's colour of the theme", () => {
    expect(pageOf(splashUrl(mark, true))).toContain(`background: ${backdropColor(true)}`)
    expect(pageOf(splashUrl(mark, false))).toContain(`background: ${backdropColor(false)}`)
    expect(backdropColor(true)).not.toBe(backdropColor(false))
  })
})
