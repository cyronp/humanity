import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  type Attachment,
  type AttachmentContent,
  type AttachmentKind,
  type AttachmentUpload,
  checkAttachment,
  checkAttachmentSet,
  formatBytes,
  type SessionId,
} from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { FileText, ImageOff, X } from "lucide-react"
import {
  type ClipboardEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { InlineError } from "@/components/InlineError"
import {
  AttachmentAction,
  AttachmentActions,
  Attachment as AttachmentCard,
  AttachmentContent as AttachmentCardContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment"
import { InputGroupAddon } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { attachmentAtom, fetchAttachmentAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"

interface DraftAttachment {
  readonly id: string
  readonly name: string
  readonly size: number
  readonly kind: AttachmentKind
  /** base64 */
  readonly data: string
  /** An object URL for an image's thumbnail. */
  readonly previewUrl: string | undefined
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ""
  // In slices, so a large file never overflows the argument list.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary)
}

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files")

/**
 * The files of the message being written: added from the paperclip, pasted
 * or dropped onto the box. Every file is checked here with the daemon's own
 * rules, so a refusal shows up before sending.
 */
export function useAttachmentDraft() {
  const [items, setItems] = useState<ReadonlyArray<DraftAttachment>>([])
  const [error, setError] = useState<string>()
  const [reading, setReading] = useState(0)
  const [dragging, setDragging] = useState(false)
  const previews = useRef(new Set<string>())
  // The latest items, for checks made after reading files asynchronously.
  const latest = useRef(items)
  useEffect(() => {
    latest.current = items
  }, [items])

  useEffect(() => {
    const urls = previews.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const release = (item: DraftAttachment) => {
    if (item.previewUrl === undefined) return
    URL.revokeObjectURL(item.previewUrl)
    previews.current.delete(item.previewUrl)
  }

  const add = async (files: ReadonlyArray<File>) => {
    if (files.length === 0) return
    setError(undefined)
    setReading((count) => count + 1)
    const problems: Array<string> = []
    const added: Array<DraftAttachment> = []
    for (const file of files) {
      const name = file.name || "pasted file"
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const check = checkAttachment(bytes)
        if (!check.ok) {
          problems.push(`${name}: ${check.reason}`)
          continue
        }
        let previewUrl: string | undefined
        if (check.kind === "image") {
          previewUrl = URL.createObjectURL(file)
          previews.current.add(previewUrl)
        }
        added.push({
          id: crypto.randomUUID(),
          name,
          size: bytes.length,
          kind: check.kind,
          data: toBase64(bytes),
          previewUrl,
        })
      } catch {
        problems.push(`${name}: The file could not be read.`)
      }
    }
    setReading((count) => count - 1)
    const tooMany = checkAttachmentSet([...latest.current, ...added].map((item) => item.size))
    if (tooMany === undefined) {
      setItems((current) => [...current, ...added])
    } else {
      problems.push(tooMany)
      added.forEach(release)
    }
    if (problems.length > 0) setError(problems.join("\n"))
  }

  const remove = (id: string) => {
    const item = items.find((candidate) => candidate.id === id)
    if (item !== undefined) release(item)
    setItems((current) => current.filter((candidate) => candidate.id !== id))
  }

  const clear = () => {
    items.forEach(release)
    setItems([])
    setError(undefined)
  }

  /** Pasted files are attached; a paste that also carries text stays a text paste. */
  const onPaste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length === 0 || event.clipboardData.types.includes("text/plain")) return
    event.preventDefault()
    void add(files)
  }

  const dropProps = {
    "data-dragging": dragging || undefined,
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
      setDragging(true)
    },
    onDragLeave: (event: DragEvent) => {
      // Moving between the box's own children is not leaving it.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      setDragging(false)
      void add(Array.from(event.dataTransfer.files))
    },
  }

  const uploads: ReadonlyArray<AttachmentUpload> = items.map(({ name, data }) => ({ name, data }))

  return { items, uploads, error, reading: reading > 0, add, remove, clear, onPaste, dropProps }
}

export type AttachmentDraft = ReturnType<typeof useAttachmentDraft>

export const dropTargetClass =
  "data-[dragging]:border-primary data-[dragging]:ring-2 data-[dragging]:ring-primary/30"

/** A file as a card: 48px tall, its preview 40px square, on the page's colour. */
const CARD =
  "h-12 max-w-56 min-w-0 flex-nowrap gap-2 bg-background has-data-[slot=attachment-content]:px-1"
const CARD_MEDIA = "group-data-[size=xs]/attachment:w-10"
/** Name over size at the line height of small text, with no gap between them. */
const CARD_TEXT = "text-xs"

export function AttachmentTray({ draft }: { readonly draft: AttachmentDraft }) {
  if (draft.items.length === 0 && !draft.reading) return null
  return (
    <InputGroupAddon align="block-start" className="flex-wrap justify-start gap-2 px-3 pt-3">
      {draft.items.map((item) => (
        <AttachmentCard key={item.id} size="xs" className={CARD}>
          {item.previewUrl === undefined ? (
            <AttachmentMedia className={CARD_MEDIA}>
              <FileText className="size-4 text-muted-foreground" />
            </AttachmentMedia>
          ) : (
            <AttachmentMedia variant="image" className={CARD_MEDIA}>
              <img src={item.previewUrl} alt="" />
            </AttachmentMedia>
          )}
          <AttachmentCardContent className={CARD_TEXT}>
            <AttachmentTitle>{item.name}</AttachmentTitle>
            <AttachmentDescription className="mt-0">{formatBytes(item.size)}</AttachmentDescription>
          </AttachmentCardContent>
          <AttachmentActions>
            <AttachmentAction
              variant="muted"
              aria-label={`Remove ${item.name}`}
              onClick={() => draft.remove(item.id)}
            >
              <X className="size-4" />
            </AttachmentAction>
          </AttachmentActions>
        </AttachmentCard>
      ))}
      {draft.reading && <Skeleton className="h-12 w-32 rounded-lg" aria-label="Reading files" />}
    </InputGroupAddon>
  )
}

const blobOf = (content: AttachmentContent) => {
  const binary = atob(content.data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  // Text is shown as text, never rendered as a page.
  const type = content.mediaType === "text/plain" ? "text/plain;charset=utf-8" : content.mediaType
  return new Blob([bytes], { type })
}

/** Opens a stored attachment in a new tab: the browser's own image, PDF or text viewer. */
const useOpenAttachment = (sessionId: SessionId) => {
  const load = useAtomSet(fetchAttachmentAtom, { mode: "promiseExit" })
  const [error, setError] = useState<string>()
  const open = useCallback(
    async (attachment: Attachment) => {
      setError(undefined)
      // Opened before the await, so the browser counts it as the click's own popup.
      const tab = window.open("", "_blank")
      const exit = await load({ payload: { sessionId, attachmentId: attachment.id } })
      if (Exit.isFailure(exit)) {
        tab?.close()
        setError(describeCause(exit.cause))
        return
      }
      const url = URL.createObjectURL(blobOf(exit.value))
      if (tab === null) window.location.assign(url)
      else tab.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
    [load, sessionId],
  )
  return { open, error }
}

/** The files sent with a message, in the transcript. Images show as thumbnails. */
export function MessageAttachments({
  sessionId,
  attachments,
}: {
  readonly sessionId: SessionId
  readonly attachments: ReadonlyArray<Attachment>
}) {
  const { open, error } = useOpenAttachment(sessionId)
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
        {attachments.map((attachment) =>
          attachment.kind === "image" ? (
            <ImageThumbnail
              key={attachment.id}
              sessionId={sessionId}
              attachment={attachment}
              onOpen={() => void open(attachment)}
            />
          ) : (
            <AttachmentCard
              key={attachment.id}
              size="xs"
              className={cn(
                CARD,
                "has-data-[slot=attachment-content]:pr-3 has-[>a,>button]:hover:bg-muted",
              )}
            >
              <AttachmentTrigger
                onClick={() => void open(attachment)}
                aria-label={`Open ${attachment.name}`}
                title={`Open ${attachment.name}`}
              />
              <AttachmentMedia className={CARD_MEDIA}>
                <FileText className="size-4 text-muted-foreground" />
              </AttachmentMedia>
              <AttachmentCardContent className={CARD_TEXT}>
                <AttachmentTitle>{attachment.name}</AttachmentTitle>
                <AttachmentDescription className="mt-0">
                  {attachment.kind === "pdf" ? "PDF" : "Text"} · {formatBytes(attachment.size)}
                </AttachmentDescription>
              </AttachmentCardContent>
            </AttachmentCard>
          ),
        )}
      </div>
      {error !== undefined && <InlineError>{error}</InlineError>}
    </div>
  )
}

function ImageThumbnail({
  sessionId,
  attachment,
  onOpen,
}: {
  readonly sessionId: SessionId
  readonly attachment: Attachment
  readonly onOpen: () => void
}) {
  const result = useAtomValue(attachmentAtom(`${sessionId}/${attachment.id}`))
  if (AsyncResult.isSuccess(result)) {
    const { mediaType, data } = result.value
    return (
      <button
        type="button"
        onClick={onOpen}
        title={`Open ${attachment.name}`}
        className="overflow-hidden rounded-lg border transition-opacity hover:opacity-90"
      >
        <img
          src={`data:${mediaType};base64,${data}`}
          alt={attachment.name}
          className="max-h-48 max-w-64 object-contain"
        />
      </button>
    )
  }
  if (AsyncResult.isFailure(result)) {
    return (
      <AttachmentCard
        size="xs"
        className="h-12 min-w-0 flex-nowrap gap-2 bg-background px-3 text-muted-foreground"
        title="This image is no longer stored."
      >
        <ImageOff className="size-4 shrink-0" />
        <AttachmentTitle className="font-normal">{attachment.name}</AttachmentTitle>
      </AttachmentCard>
    )
  }
  return <Skeleton className="size-24 rounded-lg" aria-label={`Loading ${attachment.name}`} />
}
