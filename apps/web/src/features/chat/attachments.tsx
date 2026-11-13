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
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"
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

export function AttachmentTray({ draft }: { readonly draft: AttachmentDraft }) {
  if (draft.items.length === 0 && !draft.reading) return null
  return (
    <InputGroupAddon align="block-start" className="flex-wrap justify-start gap-2 px-3 pt-3">
      {draft.items.map((item) => (
        <span
          key={item.id}
          className="flex h-12 max-w-56 items-center gap-2 rounded-lg border bg-background py-1 pr-1 pl-1 text-xs"
        >
          {item.previewUrl === undefined ? (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
              <FileText className="size-4 text-muted-foreground" />
            </span>
          ) : (
            <img
              src={item.previewUrl}
              alt=""
              className="size-10 shrink-0 rounded-md object-cover"
            />
          )}
          <span className="flex min-w-0 flex-col text-left">
            <span className="truncate font-medium text-foreground">{item.name}</span>
            <span className="text-muted-foreground">{formatBytes(item.size)}</span>
          </span>
          <InputGroupButton
            size="icon-xs"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${item.name}`}
            onClick={() => draft.remove(item.id)}
          >
            <X />
          </InputGroupButton>
        </span>
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
            <button
              key={attachment.id}
              type="button"
              onClick={() => void open(attachment)}
              className="flex h-12 max-w-56 items-center gap-2 rounded-lg border bg-background py-1 pr-3 pl-1 text-left text-xs transition-colors hover:bg-muted"
              title={`Open ${attachment.name}`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <FileText className="size-4 text-muted-foreground" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{attachment.name}</span>
                <span className="text-muted-foreground">
                  {attachment.kind === "pdf" ? "PDF" : "Text"} · {formatBytes(attachment.size)}
                </span>
              </span>
            </button>
          ),
        )}
      </div>
      {error !== undefined && <p className="text-xs text-destructive">{error}</p>}
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
      <span
        className="flex h-12 items-center gap-2 rounded-lg border bg-background px-3 text-xs text-muted-foreground"
        title="This image is no longer stored."
      >
        <ImageOff className="size-4" />
        {attachment.name}
      </span>
    )
  }
  return <Skeleton className="size-24 rounded-lg" aria-label={`Loading ${attachment.name}`} />
}
