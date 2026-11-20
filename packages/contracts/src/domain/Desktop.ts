export const PREVIEW_PARTITION = "persist:humanity-preview"

export type PreviewColorScheme = "light" | "dark" | "system"

export interface PreviewOpenTab {
  readonly url: string
}

export interface PreviewDownload {
  readonly url: string
  readonly fileName: string
}

export interface PreviewShortcut {
  readonly guest: number
  readonly key: string
  readonly code: string
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
}

export interface DesktopPreviewBridge {
  readonly setColorScheme: (guest: number, scheme: PreviewColorScheme) => Promise<void>
  readonly clearData: () => Promise<void>
  readonly capture: (guest: number) => Promise<Uint8Array>
  readonly prepareCapture: (guest: number) => Promise<void>
  readonly saveRecording: (threadId: string, data: Uint8Array) => Promise<string>
  readonly reveal: (path: string) => Promise<void>
  readonly onOpenTab: (listener: (request: PreviewOpenTab) => void) => () => void
  readonly onDownload: (listener: (download: PreviewDownload) => void) => () => void
  readonly onShortcut: (listener: (shortcut: PreviewShortcut) => void) => () => void
}

export interface HumanityDesktop {
  readonly preview: DesktopPreviewBridge
}

export const PREVIEW_CHANNELS = {
  setColorScheme: "preview:set-color-scheme",
  clearData: "preview:clear-data",
  capture: "preview:capture",
  prepareCapture: "preview:prepare-capture",
  saveRecording: "preview:save-recording",
  reveal: "preview:reveal",
  openTab: "preview:open-tab",
  download: "preview:download",
  shortcut: "preview:shortcut",
} as const
