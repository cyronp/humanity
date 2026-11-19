import { describe, expect, it } from "vitest"
import {
  fitViewport,
  freeViewport,
  isLoopbackHost,
  localUrlRanges,
  localUrls,
  mergeOffers,
  parseViewport,
  parseZoom,
  previewTarget,
  stepZoom,
  viewportSize,
} from "../src/domain/Preview.ts"

describe("localUrls", () => {
  it("finds a dev server's local address through its colors, and not its LAN one", () => {
    const vite = [
      "  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m",
      "  \x1b[32m➜\x1b[39m  \x1b[1mNetwork\x1b[22m: \x1b[36mhttp://192.168.1.5:5173/\x1b[39m",
    ].join("\r\n")
    expect(localUrls(vite)).toEqual(["http://localhost:5173/"])
  })

  it("knows 127.0.0.1 and IPv6, and offers 0.0.0.0 as localhost", () => {
    expect(
      localUrls("a http://127.0.0.1:8000/docs b https://[::1]:8443 c http://0.0.0.0:3000"),
    ).toEqual(["http://127.0.0.1:8000/docs", "https://[::1]:8443/", "http://localhost:3000/"])
  })

  it("trims the punctuation around an address and offers it once", () => {
    expect(
      localUrls(
        "See (http://localhost:3000). Or http://localhost:3000, or 'http://localhost:4000/a?b=1'!",
      ),
    ).toEqual(["http://localhost:3000/", "http://localhost:4000/a?b=1"])
  })

  it("ignores hosts that only start like a local one", () => {
    expect(
      localUrls("http://localhost.example.com http://127.0.0.1.nip.io/ http://localhostx"),
    ).toEqual([])
  })

  it("passes over an OSC sequence, such as a window title", () => {
    expect(localUrls("\x1b]0;npm run dev\x07ready at http://localhost:3000\n")).toEqual([
      "http://localhost:3000/",
    ])
  })
})

describe("localUrlRanges", () => {
  it("says where each address is in the text", () => {
    expect(localUrlRanges("go to http://localhost:3000.")).toEqual([
      { start: 6, end: 27, url: "http://localhost:3000/" },
    ])
  })
})

describe("previewTarget", () => {
  const refused = new Set([7420, 7421])

  it("completes a short address", () => {
    expect(previewTarget("localhost:3000", refused)).toEqual({
      _tag: "Url",
      url: "http://localhost:3000/",
    })
    expect(previewTarget("3000/app", refused)).toEqual({
      _tag: "Url",
      url: "http://localhost:3000/app",
    })
    expect(previewTarget(" https://127.0.0.1:8443/x ", refused)).toEqual({
      _tag: "Url",
      url: "https://127.0.0.1:8443/x",
    })
    expect(previewTarget("[::1]:5000", refused)).toEqual({ _tag: "Url", url: "http://[::1]:5000/" })
  })

  it("refuses other hosts and schemes", () => {
    expect(previewTarget("example.com", refused)._tag).toBe("Refused")
    expect(previewTarget("http://192.168.1.5:5173", refused)._tag).toBe("Refused")
    expect(previewTarget("file:///etc/passwd", refused)._tag).toBe("Refused")
    expect(previewTarget("", refused)._tag).toBe("Refused")
  })

  it("refuses Humanity's own ports, whatever the host names them", () => {
    for (const address of ["localhost:7420", "http://127.0.0.1:7421/?token=x", "[::1]:7420"]) {
      const target = previewTarget(address, refused)
      expect(target._tag).toBe("Refused")
    }
    expect(previewTarget("http://localhost", new Set([80]))._tag).toBe("Refused")
  })
})

describe("mergeOffers", () => {
  it("keeps each address once, at its latest time, newest first", () => {
    expect(
      mergeOffers(
        [
          { url: "http://localhost:3000/", seenAt: "2026-11-18T10:00:00.000Z" },
          { url: "http://localhost:5173/", seenAt: "2026-11-18T10:05:00.000Z" },
        ],
        [{ url: "http://localhost:3000/", seenAt: "2026-11-18T10:10:00.000Z" }],
      ),
    ).toEqual([
      { url: "http://localhost:3000/", seenAt: "2026-11-18T10:10:00.000Z" },
      { url: "http://localhost:5173/", seenAt: "2026-11-18T10:05:00.000Z" },
    ])
  })
})

describe("viewports", () => {
  it("sizes a device, rotated or not, and a free size within the limits", () => {
    expect(viewportSize({ _tag: "fill" })).toBeUndefined()
    expect(viewportSize({ _tag: "device", id: "iphone-se", landscape: false })).toEqual({
      width: 375,
      height: 667,
    })
    expect(viewportSize({ _tag: "device", id: "iphone-se", landscape: true })).toEqual({
      width: 667,
      height: 375,
    })
    expect(freeViewport(10, 99_999)).toEqual({ _tag: "free", width: 240, height: 3840 })
    expect(parseViewport({ _tag: "device", id: "nope" })).toEqual({ _tag: "fill" })
    expect(parseViewport({ _tag: "free", width: 800.4, height: 600 })).toEqual({
      _tag: "free",
      width: 800,
      height: 600,
    })
  })

  it("fills the area, or scales a fixed size down to fit, never up", () => {
    expect(fitViewport(undefined, { width: 800, height: 600 }, 2)).toEqual({
      width: 400,
      height: 300,
      scale: 2,
    })
    expect(fitViewport({ width: 400, height: 300 }, { width: 800, height: 600 }, 1)).toEqual({
      width: 400,
      height: 300,
      scale: 1,
    })
    expect(fitViewport({ width: 1600, height: 600 }, { width: 800, height: 600 }, 1)).toEqual({
      width: 1600,
      height: 600,
      scale: 0.5,
    })
  })

  it("steps the zoom through Chromium's levels", () => {
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(1, -1)).toBe(0.9)
    expect(stepZoom(3, 1)).toBe(3)
    expect(stepZoom(0.25, -1)).toBe(0.25)
    expect(stepZoom(1.05, 1)).toBe(1.1)
    expect(parseZoom(1.3)).toBe(1)
  })
})

describe("previewTarget in the desktop app", () => {
  const refused = new Set([7420, 7421])
  const any = { anyHost: true }

  it("takes any site, over https unless it names a local host", () => {
    expect(previewTarget("example.com/docs", refused, any)).toEqual({
      _tag: "Url",
      url: "https://example.com/docs",
    })
    expect(previewTarget("localhost:5173", refused, any)).toEqual({
      _tag: "Url",
      url: "http://localhost:5173/",
    })
    expect(previewTarget("http://example.com", refused, any)).toEqual({
      _tag: "Url",
      url: "http://example.com/",
    })
  })

  it("doesn't search, and still refuses Humanity's own ports", () => {
    expect(previewTarget("how to center a div", refused, any)._tag).toBe("Refused")
    expect(previewTarget("react", refused, any)._tag).toBe("Refused")
    expect(previewTarget("127.0.0.1:7421", refused, any)._tag).toBe("Refused")
    for (const address of [
      "http://foo.localhost:7421",
      "http://[::]:7420",
      "http://[::ffff:127.0.0.1]:7421",
    ]) {
      expect(previewTarget(address, refused, any)._tag, address).toBe("Refused")
    }
    expect(previewTarget("example.com:7420", refused, any)._tag).toBe("Url")
  })
})

describe("isLoopbackHost", () => {
  const host = (url: string) => new URL(url).hostname

  it("knows every way a URL names this machine without DNS", () => {
    for (const url of [
      "http://localhost",
      "http://LOCALHOST./",
      "http://app.localhost",
      "http://127.0.0.1",
      "http://127.1",
      "http://2130706433",
      "http://0.0.0.0",
      "http://[::1]",
      "http://[::]",
      "http://[::ffff:127.0.0.1]",
      "http://[::ffff:0.0.0.0]",
    ]) {
      expect(isLoopbackHost(host(url)), url).toBe(true)
    }
  })

  it("leaves other hosts alone", () => {
    for (const url of [
      "http://example.com",
      "http://localhost.example.com",
      "http://192.168.1.5",
      "http://[::ffff:192.168.1.5]",
      "http://[2001:db8::1]",
    ]) {
      expect(isLoopbackHost(host(url)), url).toBe(false)
    }
  })
})
