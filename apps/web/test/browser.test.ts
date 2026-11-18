import type { SessionId, ToolCall } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  bashOffers,
  EMPTY_MEMORY,
  hasUnseen,
  linkLocalUrls,
  markSeen,
  onPreviewRequest,
  parseMemory,
  refusedPorts,
  requestPreview,
  takePreviewRequest,
} from "@/features/browser/browser"

const call = (patch: Partial<ToolCall>): ToolCall => ({
  id: "call",
  sessionId: "session" as SessionId,
  toolUseId: "tool-use",
  toolName: "Bash",
  input: { command: "npm run dev" },
  output: null,
  status: "succeeded",
  startedAt: "2026-11-18T10:00:00.000Z",
  finishedAt: "2026-11-18T10:00:05.000Z",
  ...patch,
})

describe("refusedPorts", () => {
  it("refuses the page's port, the daemon's and Humanity's defaults", () => {
    expect([...refusedPorts({ port: "5173", protocol: "http:" }, "127.0.0.1:7500")].sort()).toEqual(
      [5173, 7420, 7421, 7500],
    )
    expect(refusedPorts({ port: "", protocol: "http:" }, "localhost").has(80)).toBe(true)
  })
})

describe("bashOffers", () => {
  it("offers the local addresses a shell call printed, and nothing from other tools", () => {
    const offers = bashOffers([
      call({ structuredOutput: { stdout: "Local: http://localhost:5173/\n", stderr: "" } }),
      call({
        toolName: "PowerShell",
        output: { toolUseId: "x", content: "on http://127.0.0.1:8000", isError: false },
        finishedAt: null,
      }),
      call({
        toolName: "Read",
        output: { toolUseId: "y", content: "http://localhost:9999", isError: false },
      }),
    ])
    expect(offers).toEqual([
      { url: "http://localhost:5173/", seenAt: "2026-11-18T10:00:05.000Z" },
      { url: "http://127.0.0.1:8000/", seenAt: "2026-11-18T10:00:00.000Z" },
    ])
  })
})

describe("browser memory", () => {
  it("reads what it stored, and falls back on anything else", () => {
    expect(parseMemory(JSON.stringify({ url: "http://localhost:3000/", seen: ["a", 1] }))).toEqual({
      url: "http://localhost:3000/",
      seen: ["a"],
    })
    expect(parseMemory("{nope")).toEqual(EMPTY_MEMORY)
    expect(parseMemory(null)).toEqual(EMPTY_MEMORY)
  })

  it("knows which offered addresses are new, until they are seen", () => {
    const offers = [{ url: "http://localhost:3000/", seenAt: "2026-11-18T10:00:00.000Z" }]
    expect(hasUnseen(EMPTY_MEMORY, offers)).toBe(true)
    const seen = markSeen(EMPTY_MEMORY, offers)
    expect(hasUnseen(seen, offers)).toBe(false)
    expect(markSeen(seen, offers)).toBe(seen)
  })
})

describe("linkLocalUrls", () => {
  it("links an address that runs across styled segments", () => {
    const pieces = linkLocalUrls([
      { text: "Local: http://localhost:" },
      { text: "5173", bold: true },
      { text: "/ ready" },
    ])
    expect(pieces.map((each) => each.map((piece) => [piece.text, piece.url ?? null]))).toEqual([
      [
        ["Local: ", null],
        ["http://localhost:", "http://localhost:5173/"],
      ],
      [["5173", "http://localhost:5173/"]],
      [
        ["/", "http://localhost:5173/"],
        [" ready", null],
      ],
    ])
  })

  it("leaves text without an address whole", () => {
    expect(linkLocalUrls([{ text: "nothing here" }])).toEqual([
      [{ segment: { text: "nothing here" }, text: "nothing here", url: undefined }],
    ])
  })
})

describe("requestPreview", () => {
  it("says no when no Browser listens, and hands a request to the one that opens", () => {
    expect(requestPreview("http://localhost:3000/")).toBe(false)
    const heard: Array<string> = []
    const stop = onPreviewRequest((request) => heard.push(request.url))
    expect(requestPreview("http://localhost:3000/")).toBe(true)
    expect(heard).toEqual(["http://localhost:3000/"])
    expect(takePreviewRequest()?.url).toBe("http://localhost:3000/")
    expect(takePreviewRequest()).toBeUndefined()
    stop()
    expect(requestPreview("http://localhost:3000/")).toBe(false)
  })
})
