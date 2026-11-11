import { describe, expect, it } from "vitest"
import { ATTACHMENT_LIMITS, checkAttachment, checkAttachmentSet, decodeText } from "../src/index.ts"

const bytes = (...parts: ReadonlyArray<string | ReadonlyArray<number>>) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? Array.from(new TextEncoder().encode(part)) : [...part],
    ),
  )

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe("checkAttachment", () => {
  it("recognizes files by their bytes", () => {
    const kinds = [
      bytes(PNG, [0, 0, 0, 13]),
      bytes([0xff, 0xd8, 0xff, 0xe0]),
      bytes("GIF89a", [1, 0]),
      bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "),
      bytes("%PDF-1.7\n"),
      bytes("const a = 1\n"),
      bytes([0xef, 0xbb, 0xbf], "# Título\n"),
    ].map((file) => {
      const check = checkAttachment(file)
      return check.ok ? `${check.kind} ${check.mediaType}` : check.reason
    })
    expect(kinds).toEqual([
      "image image/png",
      "image image/jpeg",
      "image image/gif",
      "image image/webp",
      "pdf application/pdf",
      "text text/plain",
      "text text/plain",
    ])
  })

  it("refuses binary files it cannot send, and empty ones", () => {
    const zip = checkAttachment(bytes("PK", [3, 4, 0x14, 0, 0xff, 0xfe]))
    expect(zip.ok).toBe(false)
    if (!zip.ok) expect(zip.reason).toMatch(/Save Word, Excel or other documents as PDF/)
    // Valid UTF-8 with a NUL byte is still binary.
    expect(checkAttachment(bytes("abc", [0], "def")).ok).toBe(false)
    expect(checkAttachment(new Uint8Array()).ok).toBe(false)
  })

  it("holds each kind to its own size limit", () => {
    const image = new Uint8Array(ATTACHMENT_LIMITS.bytes.image + 1)
    image.set(PNG)
    const check = checkAttachment(image)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toMatch(/^An image can be at most 3\.75 MB/)

    const text = new Uint8Array(ATTACHMENT_LIMITS.bytes.text).fill(0x61)
    expect(checkAttachment(text).ok).toBe(true)
  })

  it("decodes text without its byte order mark", () => {
    expect(decodeText(bytes([0xef, 0xbb, 0xbf], "hi"))).toBe("hi")
    expect(decodeText(bytes([0xc3, 0x28]))).toBeUndefined()
  })
})

describe("checkAttachmentSet", () => {
  it("limits how many files and how many bytes one message carries", () => {
    expect(checkAttachmentSet([1, 2, 3])).toBeUndefined()
    expect(checkAttachmentSet(Array.from({ length: 11 }, () => 1))).toMatch(/at most 10 files/)
    expect(checkAttachmentSet([ATTACHMENT_LIMITS.totalBytes, 1])).toMatch(/at most 20 MB/)
  })
})
