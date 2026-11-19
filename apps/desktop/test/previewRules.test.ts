import { describe, expect, it } from "vitest"
import {
  guestDestinationOf,
  isAppShortcut,
  isRecording,
  recordingPath,
} from "../src/previewRules.ts"

describe("guestDestinationOf", () => {
  const app = "http://127.0.0.1:7421"

  it("lets a page show any web address", () => {
    expect(guestDestinationOf("https://example.com/a", app)).toBe("page")
    expect(guestDestinationOf("http://localhost:5173/", app)).toBe("page")
    expect(guestDestinationOf("about:blank", app)).toBe("page")
  })

  it("refuses Humanity, under any loopback name", () => {
    for (const url of [
      "http://127.0.0.1:7421/?token=x",
      "http://localhost:7421/",
      "http://[::1]:7420/",
      "http://127.0.0.2:7420/",
      "http://127.1:7421/",
      "http://foo.localhost:7421/",
      "http://localhost.:7421/",
      "http://[::]:7421/",
      "http://[::ffff:127.0.0.1]:7420/",
      "http://[0:0:0:0:0:0:0:1]:7420/",
    ]) {
      expect(guestDestinationOf(url, app), url).toBe("own")
    }
    expect(guestDestinationOf("http://localhost:5173/", "http://127.0.0.1:5173")).toBe("own")
    expect(guestDestinationOf("https://example.com:7420/", app)).toBe("page")
  })

  it("hands mail links out and blocks other schemes", () => {
    expect(guestDestinationOf("mailto:a@b.c", app)).toBe("external")
    expect(guestDestinationOf("file:///C:/Windows/win.ini", app)).toBe("blocked")
    expect(guestDestinationOf("javascript:alert(1)", app)).toBe("blocked")
    expect(guestDestinationOf("not a url", app)).toBe("blocked")
  })
})

describe("isAppShortcut", () => {
  const key = (
    pressed: Partial<Parameters<typeof isAppShortcut>[0]> & { readonly key: string },
  ): Parameters<typeof isAppShortcut>[0] => ({
    type: "keyDown",
    code: "",
    control: false,
    shift: false,
    alt: false,
    meta: false,
    ...pressed,
  })

  it("takes the terminal dock's shortcuts from a page, on every platform", () => {
    for (const mac of [false, true]) {
      expect(isAppShortcut(key({ key: "`", code: "Backquote", control: true }), mac)).toBe(true)
      expect(
        isAppShortcut(key({ key: "~", code: "Backquote", control: true, shift: true }), mac),
      ).toBe(true)
      expect(isAppShortcut(key({ key: "`", code: "Backquote" }), mac)).toBe(false)
    }
  })

  it("takes find as the platform names it", () => {
    expect(isAppShortcut(key({ key: "f", control: true }), false)).toBe(true)
    expect(isAppShortcut(key({ key: "F", control: true }), false)).toBe(true)
    expect(isAppShortcut(key({ key: "f", meta: true }), true)).toBe(true)
    expect(isAppShortcut(key({ key: "f", meta: true }), false)).toBe(false)
    expect(isAppShortcut(key({ key: "f", control: true }), true)).toBe(false)
    expect(isAppShortcut(key({ key: "f", control: true, shift: true }), false)).toBe(false)
  })

  it("leaves the page its own keys, and key releases", () => {
    expect(isAppShortcut(key({ key: "b", control: true }), false)).toBe(false)
    expect(isAppShortcut(key({ key: "f" }), false)).toBe(false)
    expect(
      isAppShortcut(key({ type: "keyUp", key: "`", code: "Backquote", control: true }), false),
    ).toBe(false)
  })
})

describe("recordings", () => {
  const home = "/home/me/.humanity"
  const now = new Date("2026-11-18T10:00:00.000Z")

  it("go under the thread's folder of recordings", () => {
    expect(recordingPath(home, "abc-123", 1000, now)).toEqual({
      path: expect.stringMatching(/recordings[\\/]abc-123[\\/]2026-11-18T10-00-00-000Z\.webm$/),
    })
  })

  it("refuse odd thread ids, empty and oversized files", () => {
    expect(recordingPath(home, "../x", 1000, now)).toHaveProperty("refused")
    expect(recordingPath(home, "a", 0, now)).toHaveProperty("refused")
    expect(recordingPath(home, "a", 60 * 1024 * 1024, now)).toHaveProperty("refused")
  })

  it("are the only files Reveal shows", () => {
    expect(isRecording(home, `${home}/recordings/a/b.webm`)).toBe(true)
    expect(isRecording(home, `${home}/recordings/../humanity.db`)).toBe(false)
    expect(isRecording(home, `${home}/recordings`)).toBe(false)
  })
})
