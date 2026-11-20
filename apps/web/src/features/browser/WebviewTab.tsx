import { PREVIEW_PARTITION, type PreviewColorScheme } from "@humanity/contracts"
import { useEffect, useLayoutEffect, useRef } from "react"
import {
  type CrashRecovery,
  desktopPreview,
  NO_CRASHES,
  planCrashRecovery,
  type WebviewElement,
} from "./desktop.ts"

export interface TabLive {
  readonly loading: boolean
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly muted: boolean
  readonly colorScheme: PreviewColorScheme
  readonly favicon: string | undefined
  readonly failure: { readonly url: string; readonly description: string } | undefined
  readonly crashed: boolean
  readonly found: { readonly active: number; readonly matches: number } | undefined
}

export const IDLE_TAB: TabLive = {
  loading: false,
  canGoBack: false,
  canGoForward: false,
  muted: false,
  colorScheme: "system",
  favicon: undefined,
  failure: undefined,
  crashed: false,
  found: undefined,
}

export interface TabController {
  readonly back: () => void
  readonly forward: () => void
  readonly reload: (hard: boolean) => void
  readonly stop: () => void
  readonly find: (
    text: string,
    options: { readonly forward: boolean; readonly next: boolean },
  ) => void
  readonly stopFind: () => void
  readonly devTools: () => void
  readonly setMuted: (muted: boolean) => void
  readonly setColorScheme: (scheme: PreviewColorScheme) => void
  readonly guestId: () => number | undefined
  readonly execute: (code: string) => Promise<unknown>
  readonly focus: () => void
}

interface WebviewEvent extends Event {
  readonly url?: string
  readonly isMainFrame?: boolean
  readonly title?: string
  readonly favicons?: ReadonlyArray<string>
  readonly errorCode?: number
  readonly errorDescription?: string
  readonly validatedURL?: string
  readonly result?: { readonly activeMatchOrdinal: number; readonly matches: number }
}

const ABORTED = -3

export function WebviewTab({
  tabId,
  url,
  zoom,
  onLive,
  onNavigated,
  onTitle,
  register,
}: {
  readonly tabId: string
  readonly url: string
  readonly zoom: number
  readonly onLive: (tabId: string, patch: Partial<TabLive>) => void
  readonly onNavigated: (tabId: string, url: string) => void
  readonly onTitle: (tabId: string, title: string) => void
  readonly register: (tabId: string, controller: TabController | undefined) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<WebviewElement | null>(null)
  const ready = useRef(false)
  const shownUrl = useRef(url)
  const settings = useRef({ zoom, muted: false, colorScheme: "system" as PreviewColorScheme })
  const callbacks = useRef({ onLive, onNavigated, onTitle })
  useLayoutEffect(() => {
    callbacks.current = { onLive, onNavigated, onTitle }
  })

  useEffect(() => {
    const element = host.current
    if (element === null) return
    const webview = document.createElement("webview") as WebviewElement
    webview.setAttribute("partition", PREVIEW_PARTITION)
    webview.setAttribute("allowpopups", "true")
    webview.setAttribute("src", shownUrl.current)
    webview.style.width = "100%"
    webview.style.height = "100%"
    webview.style.display = "flex"
    element.appendChild(webview)
    view.current = webview
    let crashes: CrashRecovery = NO_CRASHES
    let crashTimer: ReturnType<typeof setTimeout> | undefined

    const live = (patch: Partial<TabLive>) => callbacks.current.onLive(tabId, patch)
    const history = () =>
      ready.current ? { canGoBack: webview.canGoBack(), canGoForward: webview.canGoForward() } : {}
    const applyColorScheme = () => {
      const bridge = desktopPreview()
      if (bridge === undefined || settings.current.colorScheme === "system") return
      void bridge
        .setColorScheme(webview.getWebContentsId(), settings.current.colorScheme)
        .catch(() => undefined)
    }
    const navigated = (event: Event) => {
      const { url: next, isMainFrame } = event as WebviewEvent
      if (next === undefined || isMainFrame === false) return
      shownUrl.current = next
      callbacks.current.onNavigated(tabId, next)
      live(history())
    }
    const listeners: Record<string, (event: Event) => void> = {
      "dom-ready": () => {
        ready.current = true
        webview.setZoomFactor(settings.current.zoom)
        webview.setAudioMuted(settings.current.muted)
        applyColorScheme()
        live({ crashed: false, ...history() })
      },
      "did-start-loading": () => live({ loading: true, failure: undefined }),
      "did-stop-loading": () => live({ loading: false, ...history() }),
      "did-navigate": navigated,
      "did-navigate-in-page": navigated,
      "page-title-updated": (event) => {
        const { title } = event as WebviewEvent
        if (title !== undefined) callbacks.current.onTitle(tabId, title)
      },
      "page-favicon-updated": (event) => live({ favicon: (event as WebviewEvent).favicons?.[0] }),
      "did-fail-load": (event) => {
        const failed = event as WebviewEvent
        if (failed.isMainFrame === false || failed.errorCode === ABORTED) return
        live({
          loading: false,
          failure: {
            url: failed.validatedURL ?? shownUrl.current,
            description: failed.errorDescription || `Error ${failed.errorCode ?? ""}`.trim(),
          },
        })
      },
      "render-process-gone": () => {
        ready.current = false
        const plan = planCrashRecovery(crashes, Date.now())
        if (plan === undefined) {
          live({ crashed: true, loading: false })
          return
        }
        crashes = plan.state
        crashTimer = setTimeout(() => webview.reload(), plan.delayMs)
      },
      "found-in-page": (event) => {
        const result = (event as WebviewEvent).result
        if (result !== undefined) {
          live({ found: { active: result.activeMatchOrdinal, matches: result.matches } })
        }
      },
    }
    for (const [name, listener] of Object.entries(listeners)) {
      webview.addEventListener(name, listener)
    }
    const stopShortcuts = desktopPreview()?.onShortcut(({ guest, ...key }) => {
      if (!ready.current || guest !== webview.getWebContentsId()) return
      webview.dispatchEvent(
        new KeyboardEvent("keydown", { ...key, bubbles: true, cancelable: true, composed: true }),
      )
    })

    const whenReady = (action: () => void) => {
      if (ready.current) action()
    }
    callbacks.current.onLive(tabId, {})
    register(tabId, {
      back: () => whenReady(() => webview.goBack()),
      forward: () => whenReady(() => webview.goForward()),
      reload: (hard) => {
        live({ crashed: false, failure: undefined })
        crashes = NO_CRASHES
        if (!ready.current) return void webview.setAttribute("src", shownUrl.current)
        if (hard) webview.reloadIgnoringCache()
        else webview.reload()
      },
      stop: () => whenReady(() => webview.stop()),
      find: (text, options) =>
        whenReady(() => {
          if (text === "") {
            webview.stopFindInPage("clearSelection")
            live({ found: undefined })
            return
          }
          webview.findInPage(text, { forward: options.forward, findNext: options.next })
        }),
      stopFind: () =>
        whenReady(() => {
          webview.stopFindInPage("clearSelection")
          live({ found: undefined })
        }),
      devTools: () => whenReady(() => webview.openDevTools()),
      setMuted: (muted) => {
        settings.current.muted = muted
        live({ muted })
        whenReady(() => webview.setAudioMuted(muted))
      },
      setColorScheme: (colorScheme) => {
        const previous = settings.current.colorScheme
        settings.current.colorScheme = colorScheme
        live({ colorScheme })
        const bridge = desktopPreview()
        if (!ready.current || bridge === undefined) return
        if (colorScheme === "system" && previous === "system") return
        void bridge.setColorScheme(webview.getWebContentsId(), colorScheme).catch(() => undefined)
      },
      guestId: () => (ready.current ? webview.getWebContentsId() : undefined),
      focus: () => webview.focus(),
      execute: (code) =>
        ready.current
          ? webview.executeJavaScript(code, true)
          : Promise.reject(new Error("The page is not ready.")),
    })

    return () => {
      stopShortcuts?.()
      clearTimeout(crashTimer)
      register(tabId, undefined)
      for (const [name, listener] of Object.entries(listeners)) {
        webview.removeEventListener(name, listener)
      }
      ready.current = false
      view.current = null
      webview.remove()
    }
  }, [tabId, register])

  useEffect(() => {
    const webview = view.current
    if (webview === null || url === shownUrl.current) return
    shownUrl.current = url
    if (ready.current) void webview.loadURL(url).catch(() => undefined)
    else webview.setAttribute("src", url)
  }, [url])

  useEffect(() => {
    settings.current.zoom = zoom
    if (ready.current) view.current?.setZoomFactor(zoom)
  }, [zoom])

  return <div ref={host} className="flex h-full w-full" />
}
