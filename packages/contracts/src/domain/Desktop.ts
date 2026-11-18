/** The partition every Browser page of the desktop app runs in, apart from the app's own. */
export const PREVIEW_PARTITION = "persist:humanity-preview"

export type PreviewColorScheme = "light" | "dark" | "system"

/** A page asked for a new window; the Browser opens it as a tab. */
export interface PreviewOpenTab {
  readonly url: string
}

/** A page started a download; it was cancelled and its address opened in the human's browser. */
export interface PreviewDownload {
  readonly url: string
  readonly fileName: string
}

/**
 * What the desktop app's preload lends the web app for its Browser, as
 * `window.humanityDesktop.preview`. Every call that names a page (`guest`, a `<webview>`'s
 * `getWebContentsId()`) only works on a page of the calling window.
 */
export interface DesktopPreviewBridge {
  readonly setColorScheme: (guest: number, scheme: PreviewColorScheme) => Promise<void>
  /** Clears the Browser partition's cookies, storage and cache. */
  readonly clearData: () => Promise<void>
  /** The visible page as a PNG. */
  readonly capture: (guest: number) => Promise<Uint8Array>
  /** A media source id for `getUserMedia`'s `chromeMediaSourceId`, to record or mirror a page. */
  readonly mediaSourceId: (guest: number) => Promise<string>
  /** Saves a recording under `~/.humanity/recordings/` and returns its path. */
  readonly saveRecording: (threadId: string, data: Uint8Array) => Promise<string>
  /** Shows a saved recording in the system's file manager. */
  readonly reveal: (path: string) => Promise<void>
  readonly onOpenTab: (listener: (request: PreviewOpenTab) => void) => () => void
  readonly onDownload: (listener: (download: PreviewDownload) => void) => () => void
}

export interface HumanityDesktop {
  readonly preview: DesktopPreviewBridge
}

/** The IPC channels behind the bridge. */
export const PREVIEW_CHANNELS = {
  setColorScheme: "preview:set-color-scheme",
  clearData: "preview:clear-data",
  capture: "preview:capture",
  mediaSourceId: "preview:media-source-id",
  saveRecording: "preview:save-recording",
  reveal: "preview:reveal",
  openTab: "preview:open-tab",
  download: "preview:download",
} as const
