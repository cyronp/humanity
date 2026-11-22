import { type ChatMessage, type MessageContent, SessionId } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { rewindSummary, undoableRewinds } from "@/features/chat/transcriptActions"
import { rewindWarnings } from "@/features/session/RewindDialog"

const message = (id: string, content: MessageContent): ChatMessage => ({
  id,
  sessionId: SessionId.make("s1"),
  content,
  createdAt: "2026-11-22T10:00:00.000Z",
})

const rewound = (undo: "available" | "done" | "none") =>
  ({ _tag: "rewind", conversation: true, restored: 2, undo, message: "Fix it" }) as const

describe("undoableRewinds", () => {
  it("offers Undo on a restore until the human sends another message", () => {
    const messages = [
      message("u1", { _tag: "user", text: "hi" }),
      message("r1", rewound("available")),
      message("r2", rewound("done")),
      message("r3", rewound("available")),
    ]
    expect([...undoableRewinds(messages)]).toEqual(["r1", "r3"])
    expect([
      ...undoableRewinds([...messages, message("u2", { _tag: "user", text: "go on" })]),
    ]).toEqual([])
  })
})

describe("rewindSummary", () => {
  it("says what was rewound and how many files came back", () => {
    expect(rewindSummary(rewound("available"))).toBe(
      "Rewound to before “Fix it” · 2 files restored",
    )
    expect(
      rewindSummary({
        _tag: "rewind",
        conversation: false,
        restored: 1,
        undo: "done",
        message: "Fix it",
      }),
    ).toBe("Restored the files from before “Fix it” · 1 file restored · undone")
    expect(rewindSummary({ ...rewound("none"), restored: 0 })).toBe("Rewound to before “Fix it”")
  })
})

describe("rewindWarnings", () => {
  const preview = {
    messageId: "m",
    checkpoint: true,
    changes: [],
    changed: 3,
    removedMessages: 4,
    sharedCheckout: true,
    busyTerminals: 1,
  }

  it("warns about other threads in the checkout and about running terminals", () => {
    expect(rewindWarnings(preview)).toEqual([
      "This thread works in the project's checkout: other threads working there see the restored files too.",
      "1 terminal of this thread is running a command, which may change files again.",
    ])
    expect(
      rewindWarnings({ ...preview, changed: 0, sharedCheckout: true, busyTerminals: 2 }),
    ).toEqual(["2 terminals of this thread are running a command, which may change files again."])
  })
})
