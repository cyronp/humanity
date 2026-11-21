import { FILL_VIEWPORT } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { formatNumber, parseNumber, stepNumber } from "@/components/ui/number-input"
import { browserDefaultsOf } from "@/features/browser/browser"
import { isSendKey } from "@/features/chat/ChatBox"
import { notificationFor } from "@/features/notifications/notify"
import { mergeOptions, preferMergeMethod } from "@/features/session/panel/publication"
import { diagnosticsText } from "@/features/system/diagnostics"
import { formatBytes } from "@/features/system/atoms"
import { terminalFontFamily } from "@/features/terminal/TerminalView"
import { TERMINAL_FONT_FAMILY } from "@/features/terminal/theme"
import { DEFAULT_UI_PREFERENCES, parseUiPreferences } from "@/lib/uiPreferences"

describe("the app's own preferences", () => {
  it("starts from the defaults and keeps only the values it knows", () => {
    expect(parseUiPreferences(null)).toEqual(DEFAULT_UI_PREFERENCES)
    expect(parseUiPreferences("not json")).toEqual(DEFAULT_UI_PREFERENCES)
    expect(
      parseUiPreferences(
        JSON.stringify({
          sendKey: "mod-enter",
          interfaceScale: 125,
          codeTheme: "one",
          fetchMinutes: 0,
          notifyWaiting: true,
        }),
      ),
    ).toEqual({
      ...DEFAULT_UI_PREFERENCES,
      sendKey: "mod-enter",
      interfaceScale: 125,
      codeTheme: "one",
      fetchMinutes: 0,
      notifyWaiting: true,
    })
    expect(
      parseUiPreferences(
        JSON.stringify({
          sendKey: "space",
          interfaceScale: 300,
          codeTheme: "neon",
          fetchMinutes: 2,
        }),
      ),
    ).toEqual(DEFAULT_UI_PREFERENCES)
  })
})

describe("the send key", () => {
  const press = (patch: Partial<Parameters<typeof isSendKey>[0]> = {}) => ({
    key: "Enter",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    ...patch,
  })

  it("sends on Enter, and Shift+Enter starts a line", () => {
    expect(isSendKey(press(), "enter")).toBe(true)
    expect(isSendKey(press({ shiftKey: true }), "enter")).toBe(false)
    expect(isSendKey(press({ isComposing: true }), "enter")).toBe(false)
    expect(isSendKey(press({ key: "a" }), "enter")).toBe(false)
  })

  it("sends on Ctrl or Cmd+Enter only, when the human asked for it", () => {
    expect(isSendKey(press(), "mod-enter")).toBe(false)
    expect(isSendKey(press({ ctrlKey: true }), "mod-enter")).toBe(true)
    expect(isSendKey(press({ metaKey: true }), "mod-enter")).toBe(true)
  })
})

describe("thread notifications", () => {
  const all = { notifyWaiting: true, notifyFinished: true, notifyFailed: true }
  const none = { notifyWaiting: false, notifyFinished: false, notifyFailed: false }
  const thread = (status: Parameters<typeof notificationFor>[1]["status"]) => ({
    title: "Fix login",
    status,
  })

  it("tells when a thread starts waiting, finishes or fails", () => {
    expect(notificationFor("running", thread("waiting_for_human"), all)?.kind).toBe("waiting")
    expect(notificationFor("running", thread("idle"), all)?.kind).toBe("finished")
    expect(notificationFor("waiting_for_human", thread("error"), all)?.kind).toBe("failed")
  })

  it("stays quiet on the first sight, on no change and when turned off", () => {
    expect(notificationFor(undefined, thread("waiting_for_human"), all)).toBeUndefined()
    expect(notificationFor("idle", thread("idle"), all)).toBeUndefined()
    expect(notificationFor("waiting_for_human", thread("idle"), all)).toBeUndefined()
    expect(notificationFor("running", thread("waiting_for_human"), none)).toBeUndefined()
    expect(notificationFor("ended", thread("error"), all)).toBeUndefined()
  })
})

describe("the preferred merge method", () => {
  it("is offered first, and the rest keep their order", () => {
    const methods = (preferred: Parameters<typeof preferMergeMethod>[1]) =>
      preferMergeMethod(mergeOptions("github"), preferred).map((option) => option.method)
    expect(methods(null)).toEqual(["squash", "merge", "rebase"])
    expect(methods("rebase")).toEqual(["rebase", "squash", "merge"])
    expect(
      preferMergeMethod(mergeOptions("gitlab"), "rebase").map((option) => option.method),
    ).toEqual(["merge", "squash"])
  })
})

describe("new Browser tabs", () => {
  it("open at the device size, zoom and appearance the human picked", () => {
    expect(browserDefaultsOf({ device: "fill", zoom: 1, appearance: "system" })).toEqual({
      viewport: FILL_VIEWPORT,
      zoom: 1,
      colorScheme: "system",
    })
    expect(browserDefaultsOf({ device: "ipad-mini", zoom: 0.75, appearance: "dark" })).toEqual({
      viewport: { _tag: "device", id: "ipad-mini", landscape: false },
      zoom: 0.75,
      colorScheme: "dark",
    })
  })
})

describe("the terminal's font", () => {
  it("puts the human's font first and keeps the fallbacks", () => {
    expect(terminalFontFamily(null)).toBe(TERMINAL_FONT_FAMILY)
    expect(terminalFontFamily("  ")).toBe(TERMINAL_FONT_FAMILY)
    expect(terminalFontFamily("JetBrains Mono")).toBe(`"JetBrains Mono", ${TERMINAL_FONT_FAMILY}`)
    expect(terminalFontFamily("Iosevka")).toBe(`Iosevka, ${TERMINAL_FONT_FAMILY}`)
  })
})

describe("diagnostics", () => {
  it("names the versions and leaves out the folders", () => {
    const text = diagnosticsText({
      appVersion: "1.2.3",
      info: {
        dataDir: "/home/me/.humanity",
        recordingsDir: "/home/me/.humanity/recordings",
        port: 7420,
        platform: "linux",
        arch: "x64",
        osRelease: "6.8.0",
        nodeVersion: "22.11.0",
        electronVersion: null,
      },
      clis: [
        {
          provider: "codex",
          path: null,
          version: null,
          minimumVersion: "0.1.0",
          outdated: false,
          updateCommand: "codex update",
          installUrl: "https://example.com",
        },
      ],
      userAgent: "Test",
    })
    expect(text).toContain("Humanity 1.2.3")
    expect(text).toContain("OS: linux 6.8.0 (x64)")
    expect(text).toContain("Codex: not installed")
    expect(text).not.toContain("/home/me")
  })

  it("sizes files in readable units", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB")
  })
})

describe("the number input", () => {
  const fontSize = { min: 8, max: 32, step: 1 }
  const lineHeight = { min: 1, max: 2, step: 0.1 }

  it("steps within its bounds, without float drift", () => {
    expect(stepNumber(13, 1, fontSize)).toBe(14)
    expect(stepNumber(32, 1, fontSize)).toBe(32)
    expect(stepNumber(8, -1, fontSize)).toBe(8)
    expect(stepNumber(1.2, 1, lineHeight)).toBe(1.3)
    expect(formatNumber(stepNumber(1.2, 1, lineHeight), 0.1)).toBe("1.3")
  })

  it("reads what the human typed, fitted to the bounds", () => {
    expect(parseNumber(" 20 ", fontSize)).toBe(20)
    expect(parseNumber("99", fontSize)).toBe(32)
    expect(parseNumber("14.6", fontSize)).toBe(15)
    expect(parseNumber("1,25", lineHeight)).toBe(1.3)
    expect(parseNumber("", fontSize)).toBeUndefined()
    expect(parseNumber("big", fontSize)).toBeUndefined()
  })
})
