import {
  type AttachmentKind,
  type AttachmentUpload,
  AttachmentRejected,
  checkAttachment,
  checkAttachmentSet,
  decodeText,
} from "@humanity/contracts"
import { Effect } from "effect"
import type { AgentAttachment, AgentImageMediaType } from "../agent/AgentRunner.ts"

/** An upload that passed every check, ready to be stored and sent. */
export interface PreparedAttachment {
  readonly name: string
  readonly kind: AttachmentKind
  readonly mediaType: string
  readonly bytes: Uint8Array
}

const STRICT_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/** A file name for display only: no directories, no control characters, not too long. */
const cleanName = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? ""
  // eslint-disable-next-line no-control-regex
  const visible = base.replace(/[\u0000-\u001f\u007f]/g, "").trim()
  return visible.slice(0, 200) || "file"
}

/**
 * Decodes and checks every upload of one message. The web app runs the same
 * checks first; these are the ones that count.
 */
export const prepareAttachments = (uploads: ReadonlyArray<AttachmentUpload>) =>
  Effect.gen(function* () {
    const prepared: Array<PreparedAttachment> = []
    for (const upload of uploads) {
      const name = cleanName(upload.name)
      if (upload.data.length % 4 !== 0 || !STRICT_BASE64.test(upload.data)) {
        return yield* new AttachmentRejected({ name, reason: "The file did not arrive intact." })
      }
      const bytes = new Uint8Array(Buffer.from(upload.data, "base64"))
      const check = checkAttachment(bytes)
      if (!check.ok) return yield* new AttachmentRejected({ name, reason: check.reason })
      prepared.push({ name, kind: check.kind, mediaType: check.mediaType, bytes })
    }
    const setProblem = checkAttachmentSet(prepared.map((file) => file.bytes.length))
    if (setProblem !== undefined) {
      return yield* new AttachmentRejected({ name: "", reason: setProblem })
    }
    return prepared
  })

/** What the agent receives for one attachment. */
export const toAgentAttachment = (file: PreparedAttachment): AgentAttachment => {
  const base64 = () => Buffer.from(file.bytes).toString("base64")
  switch (file.kind) {
    case "text":
      return { kind: "text", name: file.name, text: decodeText(file.bytes) ?? "" }
    case "pdf":
      return { kind: "pdf", name: file.name, base64: base64() }
    case "image":
      return {
        kind: "image",
        name: file.name,
        mediaType: imageMediaType(file.mediaType),
        base64: base64(),
      }
  }
}

const imageMediaType = (mediaType: string): AgentImageMediaType => {
  switch (mediaType) {
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
      return mediaType
    default:
      throw new Error(`Not an image media type: ${mediaType}`)
  }
}
