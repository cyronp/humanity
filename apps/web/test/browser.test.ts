import type { SessionId, ToolCall } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  bashOffers,
  EMPTY_MEMORY,
  hasUnseen,
  linkLocalUrls,
  activeTab,
  closeTab,
  makeTab,
  markSeen,
  onPreviewOpen,
  onPreviewPending,
  openTab,
  openUrl,
  parseMemory,
  refusedPorts,
  requestPreview,
  setLinkTarget,
  tabLabel,
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
    const stored = {
      tabs: [
        {
          id: "a",
          url: "http://localhost:3000/",
          title: null,
          viewport: { _tag: "device", id: "iphone-se", landscape: true },
          zoom: 1.25,
        },
        { id: "b", url: 7, viewport: { _tag: "device", id: "nope" }, zoom: 1.3 },
      ],
      active: "b",
      seen: ["x", 1],
    }
    expect(parseMemory(JSON.stringify(stored))).toEqual({
      tabs: [
        stored.tabs[0],
        { id: "b", url: null, title: null, viewport: { _tag: "fill" }, zoom: 1 },
      ],
      active: "b",
      seen: ["x"],
    })
    expect(parseMemory("{nope")).toEqual(EMPTY_MEMORY)
    expect(parseMemory(null)).toEqual(EMPTY_MEMORY)
  })

  it("turns the address an older version kept into a tab", () => {
    const memory = parseMemory(JSON.stringify({ url: "http://localhost:3000/", seen: [] }))
    expect(memory.tabs.map((tab) => tab.url)).toEqual(["http://localhost:3000/"])
    expect(memory.active).toBe(memory.tabs[0]?.id)
  })

  it("opens an address in the tab showing it, the empty shown tab, or a new tab", () => {
    let memory = openTab(EMPTY_MEMORY)
    const first = memory.active
    memory = openUrl(memory, "http://localhost:3000/")
    expect(memory.tabs).toHaveLength(1)
    expect(activeTab(memory)?.url).toBe("http://localhost:3000/")
    memory = openUrl(memory, "http://localhost:5173/")
    expect(memory.tabs).toHaveLength(2)
    memory = openUrl(memory, "http://localhost:3000/")
    expect(memory.active).toBe(first)
    expect(memory.tabs).toHaveLength(2)
  })

  it("shows the next tab, else the previous one, when the shown one closes", () => {
    let memory = openTab(openTab(openTab(EMPTY_MEMORY, "a"), "b"), "c")
    const [a, b, c] = memory.tabs.map((tab) => tab.id)
    memory = closeTab({ ...memory, active: b ?? null }, b ?? "")
    expect(memory.active).toBe(c)
    memory = closeTab(memory, c ?? "")
    expect(memory.active).toBe(a)
    expect(closeTab(memory, a ?? "").active).toBeNull()
  })

  it("names a tab by its title, else its address", () => {
    expect(tabLabel(makeTab(null))).toBe("New tab")
    expect(tabLabel(makeTab("http://localhost:5173/app?x=1"))).toBe("localhost:5173/app")
    expect(tabLabel({ ...makeTab("http://localhost:5173/"), title: "Vite App" })).toBe("Vite App")
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
  it("says no when the page has no Browser, and hands a request to the one that opens", () => {
    expect(requestPreview("http://localhost:3000/")).toBe(false)
    let opened = 0
    let pending = 0
    const stopOpening = onPreviewOpen(() => opened++)
    const stopTaking = onPreviewPending(() => pending++)
    expect(requestPreview("http://localhost:3000/")).toBe(true)
    expect([opened, pending]).toEqual([1, 1])
    expect(takePreviewRequest()?.url).toBe("http://localhost:3000/")
    expect(takePreviewRequest()).toBeUndefined()
    stopOpening()
    stopTaking()
    expect(requestPreview("http://localhost:3000/")).toBe(false)
  })

  it("leaves clicked links to the human's browser when they ask for it, but not explicit opens", () => {
    const stop = onPreviewOpen(() => undefined)
    setLinkTarget("system")
    expect(requestPreview("http://localhost:3000/")).toBe(false)
    expect(requestPreview("http://localhost:3000/", { explicit: true })).toBe(true)
    setLinkTarget("browser")
    expect(requestPreview("http://localhost:3000/")).toBe(true)
    takePreviewRequest()
    stop()
  })
})
