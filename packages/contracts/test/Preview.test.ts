import { describe, expect, it } from "vitest"
import { localUrlRanges, localUrls, mergeOffers, previewTarget } from "../src/domain/Preview.ts"

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
