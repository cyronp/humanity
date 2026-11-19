import type { DesktopPreviewBridge, HumanityDesktop } from "@humanity/contracts"

declare global {
  interface Window {
    /** Lent by the desktop app's preload; absent in a browser tab. */
    readonly humanityDesktop?: HumanityDesktop
  }
}

/** The desktop app's Browser bridge, or undefined in a browser tab, where the Browser frames. */
export const desktopPreview = (): DesktopPreviewBridge | undefined =>
  typeof window === "undefined" ? undefined : window.humanityDesktop?.preview

/** The methods of Electron's `<webview>` element the Browser uses. */
export interface WebviewElement extends HTMLElement {
  readonly loadURL: (url: string) => Promise<void>
  readonly getURL: () => string
  readonly goBack: () => void
  readonly goForward: () => void
  readonly canGoBack: () => boolean
  readonly canGoForward: () => boolean
  readonly reload: () => void
  readonly reloadIgnoringCache: () => void
  readonly stop: () => void
  readonly findInPage: (
    text: string,
    options?: { readonly forward?: boolean; readonly findNext?: boolean },
  ) => number
  readonly stopFindInPage: (
    action: "clearSelection" | "keepSelection" | "activateSelection",
  ) => void
  readonly setZoomFactor: (factor: number) => void
  readonly setAudioMuted: (muted: boolean) => void
  readonly openDevTools: () => void
  readonly getWebContentsId: () => number
  readonly executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
}

export interface CrashRecovery {
  readonly attempts: number
  readonly since: number | null
}

export const NO_CRASHES: CrashRecovery = { attempts: 0, since: null }

const CRASH_WINDOW_MS = 30_000
const CRASH_ATTEMPTS = 3
const CRASH_DELAY_MS = 250

/**
 * When to reload a crashed page: after 250 ms, 500 ms, then 1 s, at most three times in 30 s; after
 * that the human decides.
 */
export const planCrashRecovery = (
  state: CrashRecovery,
  now: number,
): { readonly delayMs: number; readonly state: CrashRecovery } | undefined => {
  const fresh = state.since === null || now - state.since >= CRASH_WINDOW_MS
  const attempts = fresh ? 0 : state.attempts
  if (attempts >= CRASH_ATTEMPTS) return undefined
  return {
    delayMs: CRASH_DELAY_MS * 2 ** attempts,
    state: { attempts: attempts + 1, since: fresh ? now : state.since },
  }
}
