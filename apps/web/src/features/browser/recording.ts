import type { DesktopPreviewBridge } from "@humanity/contracts"
import { useEffect, useRef, useState } from "react"

const MAX_BYTES = 50 * 1024 * 1024
const MAX_MS = 10 * 60 * 1000
const FRAME_RATE = 30

/**
 * A live video of a Browser page: the desktop app answers the window's `getDisplayMedia` with the
 * page it was told about just before, with no picker.
 */
export const pageStream = async (
  bridge: DesktopPreviewBridge,
  guest: number,
): Promise<MediaStream> => {
  await bridge.prepareCapture(guest)
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: FRAME_RATE },
    audio: false,
  })
}

const stopStream = (stream: MediaStream | undefined) => {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

export const formatElapsed = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export type RecorderState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Recording"; readonly since: number; readonly tabId: string }
  | { readonly _tag: "Saving" }
  | { readonly _tag: "Saved"; readonly path: string }
  | { readonly _tag: "Failed"; readonly reason: string }

const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The page could not be recorded."

/**
 * Records a Browser page to WebM (video only, 30 fps), stopping at 50 MB or 10 minutes, and saves
 * it under `~/.humanity/recordings/<thread>/` through the desktop app.
 */
export const usePageRecorder = (bridge: DesktopPreviewBridge | undefined, threadId: string) => {
  const [state, setState] = useState<RecorderState>({ _tag: "Idle" })
  const [now, setNow] = useState(() => Date.now())
  const session = useRef<{
    recorder: MediaRecorder
    stream: MediaStream
    timer: ReturnType<typeof setTimeout>
  } | null>(null)

  useEffect(() => {
    if (state._tag !== "Recording") return
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(tick)
  }, [state._tag])

  useEffect(
    () => () => {
      const current = session.current
      if (current === null) return
      clearTimeout(current.timer)
      if (current.recorder.state !== "inactive") current.recorder.stop()
    },
    [],
  )

  const stop = () => {
    const current = session.current
    if (current === null) return
    clearTimeout(current.timer)
    if (current.recorder.state !== "inactive") current.recorder.stop()
  }

  const start = async (guest: number, tabId: string) => {
    if (bridge === undefined || session.current !== null) return
    try {
      const stream = await pageStream(bridge, guest)
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm"
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
      const chunks: Array<Blob> = []
      let size = 0
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return
        chunks.push(event.data)
        size += event.data.size
        if (size >= MAX_BYTES) stop()
      }
      recorder.onstop = () => {
        stopStream(stream)
        session.current = null
        setState({ _tag: "Saving" })
        void (async () => {
          try {
            const blob = new Blob(chunks, { type: "video/webm" })
            const bytes = new Uint8Array(await blob.arrayBuffer()).slice(0, MAX_BYTES)
            const path = await bridge.saveRecording(threadId, bytes)
            setState({ _tag: "Saved", path })
          } catch (cause) {
            setState({ _tag: "Failed", reason: describe(cause) })
          }
        })()
      }
      for (const track of stream.getVideoTracks()) track.addEventListener("ended", stop)
      const timer = setTimeout(stop, MAX_MS)
      session.current = { recorder, stream, timer }
      recorder.start(1000)
      const since = Date.now()
      setNow(since)
      setState({ _tag: "Recording", since, tabId })
    } catch (cause) {
      setState({ _tag: "Failed", reason: describe(cause) })
    }
  }

  const dismiss = () => setState({ _tag: "Idle" })
  const elapsed = state._tag === "Recording" ? formatElapsed(now - state.since) : undefined

  return { state, elapsed, start, stop, dismiss }
}

/**
 * Mirrors a Browser page in the system's picture-in-picture window, which stays on top while the
 * human works elsewhere. Closing that window stops the mirror.
 */
export const usePagePictureInPicture = (bridge: DesktopPreviewBridge | undefined) => {
  const [active, setActive] = useState(false)
  const current = useRef<{ video: HTMLVideoElement; stream: MediaStream } | null>(null)

  const close = () => {
    const mirror = current.current
    current.current = null
    setActive(false)
    if (mirror === null) return
    stopStream(mirror.stream)
    if (document.pictureInPictureElement === mirror.video) {
      void document.exitPictureInPicture().catch(() => undefined)
    }
    mirror.video.remove()
  }

  useEffect(() => () => close(), [])

  const open = async (guest: number) => {
    if (bridge === undefined) return
    if (current.current !== null) return close()
    const stream = await pageStream(bridge, guest)
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none"
    document.body.appendChild(video)
    video.addEventListener("leavepictureinpicture", close)
    for (const track of stream.getVideoTracks()) track.addEventListener("ended", close)
    current.current = { video, stream }
    await video.play()
    await video.requestPictureInPicture()
    setActive(true)
  }

  return { active, open, close }
}
