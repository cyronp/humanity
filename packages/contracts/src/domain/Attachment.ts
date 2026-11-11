import { Schema } from "effect"

/** What the agent receives: an image block, a PDF document block or a plain-text document block. */
export const AttachmentKind = Schema.Literals(["image", "pdf", "text"])
export type AttachmentKind = typeof AttachmentKind.Type

/** A file the human attached to a message, as stored. Its bytes live in the daemon's data directory. */
export const Attachment = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: AttachmentKind,
  mediaType: Schema.String,
  /** In bytes. */
  size: Schema.Number,
})
export type Attachment = typeof Attachment.Type

/** A file as the web app sends it. The daemon checks the bytes and decides what it is. */
export const AttachmentUpload = Schema.Struct({
  name: Schema.String,
  /** The file's bytes, base64-encoded. */
  data: Schema.String,
})
export type AttachmentUpload = typeof AttachmentUpload.Type

/** A stored attachment's bytes, for showing it again. */
export const AttachmentContent = Schema.Struct({
  name: Schema.String,
  mediaType: Schema.String,
  /** base64 */
  data: Schema.String,
})
export type AttachmentContent = typeof AttachmentContent.Type

const MiB = 1024 * 1024

/**
 * Kept under what the Messages API accepts: an image's base64 must stay under
 * 5 MB (so 3.75 MiB of bytes), and a whole request under 32 MB.
 */
export const ATTACHMENT_LIMITS = {
  perMessage: 10,
  totalBytes: 20 * MiB,
  bytes: { image: 3.75 * MiB, pdf: 10 * MiB, text: 1 * MiB } satisfies Record<
    AttachmentKind,
    number
  >,
} as const

export const formatBytes = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < MiB
      ? `${Math.round(bytes / 1024)} KB`
      : `${Number((bytes / MiB).toFixed(2))} MB`

const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>, offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte)

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0))

/** Recognizes a file by its first bytes, never by its name or the browser's guess. */
const sniff = (bytes: Uint8Array): { kind: AttachmentKind; mediaType: string } | undefined => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "image", mediaType: "image/png" }
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mediaType: "image/jpeg" }
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) {
    return { kind: "image", mediaType: "image/gif" }
  }
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return { kind: "image", mediaType: "image/webp" }
  }
  if (startsWith(bytes, ascii("%PDF-"))) return { kind: "pdf", mediaType: "application/pdf" }
  if (decodeText(bytes) !== undefined) return { kind: "text", mediaType: "text/plain" }
  return undefined
}

/** The file as UTF-8 text without its byte order mark, or `undefined` for a binary file. */
export const decodeText = (bytes: Uint8Array): string | undefined => {
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)
    return text.includes("\u0000") ? undefined : text
  } catch {
    return undefined
  }
}

export type AttachmentCheck =
  | { readonly ok: true; readonly kind: AttachmentKind; readonly mediaType: string }
  | { readonly ok: false; readonly reason: string }

/** Whether one file can go to the agent, and as what. Shared by the web app and the daemon. */
export const checkAttachment = (bytes: Uint8Array): AttachmentCheck => {
  if (bytes.length === 0) return { ok: false, reason: "The file is empty." }
  const found = sniff(bytes)
  if (found === undefined) {
    return {
      ok: false,
      reason:
        "Only images (PNG, JPEG, GIF, WebP), PDFs and text files can be attached. Save Word, Excel or other documents as PDF first.",
    }
  }
  const limit = ATTACHMENT_LIMITS.bytes[found.kind]
  if (bytes.length > limit) {
    const label =
      found.kind === "image" ? "An image" : found.kind === "pdf" ? "A PDF" : "A text file"
    return {
      ok: false,
      reason: `${label} can be at most ${formatBytes(limit)}; this one is ${formatBytes(bytes.length)}.`,
    }
  }
  return { ok: true, ...found }
}

/** Whether a set of files fits in one message. `undefined` when it does. */
export const checkAttachmentSet = (sizes: ReadonlyArray<number>): string | undefined => {
  if (sizes.length > ATTACHMENT_LIMITS.perMessage) {
    return `A message can carry at most ${ATTACHMENT_LIMITS.perMessage} files.`
  }
  const total = sizes.reduce((sum, size) => sum + size, 0)
  if (total > ATTACHMENT_LIMITS.totalBytes) {
    return `The files of one message can add up to at most ${formatBytes(ATTACHMENT_LIMITS.totalBytes)}; these are ${formatBytes(total)}.`
  }
  return undefined
}
