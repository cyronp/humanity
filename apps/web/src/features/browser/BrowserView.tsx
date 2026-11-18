import { useAtomSet } from "@effect/atom-react"
import {
  type LocalServer,
  type OfferedUrl,
  type PreviewProbe,
  previewTarget,
} from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import {
  Download,
  ExternalLink,
  Globe,
  PanelRightClose,
  RotateCw,
  TriangleAlert,
  X,
} from "lucide-react"
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { daemonAddress } from "@/lib/connection"
import { probeAtom } from "./atoms.ts"
import { DeviceMenu, TabStrip, ZoomControl } from "./BrowserControls.tsx"
import {
  activeTab,
  closeTab,
  onPreviewPending,
  openTab,
  openUrl,
  refusedPorts,
  takePreviewRequest,
  updateTab,
} from "./browser.ts"
import { desktopPreview } from "./desktop.ts"
import { FindBar, NavigationButtons, PageTools } from "./DesktopTools.tsx"
import { ServerList, useLocalServers } from "./ServerList.tsx"
import type { BrowserState } from "./useBrowser.ts"
import { ViewportFrame } from "./ViewportFrame.tsx"
import { IDLE_TAB, type TabController, type TabLive, WebviewTab } from "./WebviewTab.tsx"

const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"

const openOutside = (url: string) => void window.open(url, "_blank", "noopener,noreferrer")

const DOWNLOAD_NOTICE_MS = 6_000

/**
 * The Browser tool: tabs of pages, each at the panel's size or a device's. In the desktop app each
 * tab is a `<webview>` that shows any site and stays alive while hidden; in a browser tab, the shown
 * tab is a frame of a local address. The Browser stays mounted while another shelf tool shows, so
 * switching tools doesn't reload its pages.
 */
export function BrowserView({
  browser,
  shown,
  onClose,
  titlebarPadding,
}: {
  readonly browser: BrowserState
  readonly shown: boolean
  readonly onClose: () => void
  readonly titlebarPadding: string
}) {
  const { memory, change, offers, terminalNames, onSeen } = browser
  const bridge = useMemo(() => desktopPreview(), [])
  const native = bridge !== undefined
  const refused = useMemo(() => refusedPorts(window.location, daemonAddress()), [])
  const tab = activeTab(memory)
  const servers = useLocalServers(shown)
  const [error, setError] = useState<string>()
  const [reloads, setReloads] = useState<Readonly<Record<string, number>>>({})
  const [notices, setNotices] = useState<Readonly<Record<string, PreviewProbe | undefined>>>({})
  const [lives, setLives] = useState<Readonly<Record<string, TabLive>>>({})
  const [finding, setFinding] = useState(false)
  const [download, setDownload] = useState<string>()
  const controllers = useRef(new Map<string, TabController>())
  const probe = useAtomSet(probeAtom, { mode: "promiseExit" })
  const latest = useRef(memory)
  useLayoutEffect(() => {
    latest.current = memory
  })

  const onLive = useCallback((id: string, patch: Partial<TabLive>) => {
    setLives((current) => ({ ...current, [id]: { ...(current[id] ?? IDLE_TAB), ...patch } }))
  }, [])
  const register = useCallback((id: string, controller: TabController | undefined) => {
    if (controller === undefined) controllers.current.delete(id)
    else controllers.current.set(id, controller)
  }, [])
  const onNavigated = useCallback(
    (id: string, url: string) => change((memory) => updateTab(memory, id, { url })),
    [change],
  )
  const onTitle = useCallback(
    (id: string, title: string) => change((memory) => updateTab(memory, id, { title })),
    [change],
  )

  const target = (input: string) => previewTarget(input, refused, { anyHost: native })

  const reload = (id: string) => {
    if (native) {
      controllers.current.get(id)?.reload(false)
      return
    }
    setNotices((current) => ({ ...current, [id]: undefined }))
    setReloads((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }))
  }

  /** Loads what the human typed into the shown tab, or into a new one. */
  const navigate = (input: string) => {
    const result = target(input)
    if (result._tag === "Refused") {
      setError(result.reason)
      return
    }
    setError(undefined)
    const current = activeTab(latest.current)
    if (current === undefined) {
      change((memory) => openTab(memory, result.url))
      return
    }
    if (current.url === result.url) return reload(current.id)
    change((memory) => updateTab(memory, current.id, { url: result.url, title: null }))
    if (!native) reload(current.id)
  }

  /** Shows an address a link or a button asked for, reloading a tab that already shows it. */
  const show = (input: string) => {
    const result = target(input)
    if (result._tag === "Refused") {
      setError(result.reason)
      return
    }
    setError(undefined)
    const showing = latest.current.tabs.find((each) => each.url === result.url)
    change((memory) => openUrl(memory, result.url))
    if (showing !== undefined) reload(showing.id)
  }
  const showRequested = useEffectEvent(show)
  const openRequestedTab = useEffectEvent((url: string) => {
    const result = target(url)
    if (result._tag === "Url") change((memory) => openTab(memory, result.url))
  })

  useEffect(() => {
    const take = () => {
      const request = takePreviewRequest()
      if (request !== undefined) showRequested(request.url)
    }
    take()
    return onPreviewPending(take)
  }, [])

  useEffect(() => {
    if (bridge === undefined) return
    const stopTabs = bridge.onOpenTab(({ url }) => openRequestedTab(url))
    let timer: ReturnType<typeof setTimeout> | undefined
    const stopDownloads = bridge.onDownload(({ fileName }) => {
      setDownload(fileName)
      clearTimeout(timer)
      timer = setTimeout(() => setDownload(undefined), DOWNLOAD_NOTICE_MS)
    })
    return () => {
      stopTabs()
      stopDownloads()
      clearTimeout(timer)
    }
  }, [bridge])

  useEffect(() => {
    if (shown) onSeen()
  }, [shown, onSeen])

  const checkFrame = async (id: string, loaded: string) => {
    const exit = await probe({ payload: { url: loaded, embedder: window.location.origin } })
    const notice = Exit.isSuccess(exit) && exit.value._tag !== "Ok" ? exit.value : undefined
    setNotices((current) => ({ ...current, [id]: notice }))
  }

  const tabUrl = tab?.url ?? null
  const live = (tab === undefined ? undefined : lives[tab.id]) ?? IDLE_TAB
  const tabId = tab?.id
  const control = () => (tabId === undefined ? undefined : controllers.current.get(tabId))
  const pageTabs = memory.tabs.filter((each) => each.url !== null)

  const onKeyDown = (event: KeyboardEvent) => {
    if (native && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault()
      setFinding(true)
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", !shown && "hidden")} onKeyDown={onKeyDown}>
      <div
        className="titlebar flex h-12 shrink-0 items-center gap-1 border-b px-2"
        style={{ paddingRight: titlebarPadding }}
      >
        <h2 className="sr-only">Browser</h2>
        <TabStrip
          tabs={memory.tabs}
          active={memory.active}
          icons={
            new Map(
              Object.entries(lives).flatMap(([id, each]) =>
                each.favicon === undefined ? [] : [[id, each.favicon]],
              ),
            )
          }
          onSelect={(id) => change((memory) => ({ ...memory, active: id }))}
          onClose={(id) => change((memory) => closeTab(memory, id))}
          onNew={() =>
            change((memory) => {
              const blank = memory.tabs.find((each) => each.url === null)
              return blank === undefined ? openTab(memory) : { ...memory, active: blank.id }
            })
          }
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close the panel"
          title="Close the panel"
        >
          <PanelRightClose />
        </Button>
      </div>
      <Toolbar
        key={`${tab?.id}:${tabUrl}`}
        url={tabUrl}
        native={native}
        suggestions={[
          ...new Set([...servers.map((server) => server.url), ...offers.map((offer) => offer.url)]),
        ]}
        error={error !== undefined}
        onSubmit={navigate}
        leading={
          native && tabUrl !== null ? (
            <NavigationButtons live={live} control={control} />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => (tab === undefined || tabUrl === null ? undefined : reload(tab.id))}
              aria-label="Reload"
              title="Reload"
            >
              <RotateCw />
            </Button>
          )
        }
      >
        {tab !== undefined && (
          <>
            <DeviceMenu
              viewport={tab.viewport}
              onChange={(viewport) => change((memory) => updateTab(memory, tab.id, { viewport }))}
            />
            <ZoomControl
              zoom={tab.zoom}
              onChange={(zoom) => change((memory) => updateTab(memory, tab.id, { zoom }))}
            />
            {native && tabUrl !== null && (
              <PageTools
                live={live}
                control={control}
                url={tabUrl}
                onFind={() => setFinding(true)}
                onOpenOutside={() => openOutside(tabUrl)}
                onClearData={() => {
                  void bridge?.clearData().then(() => control()?.reload(true))
                }}
              />
            )}
          </>
        )}
      </Toolbar>
      {native && finding && tabUrl !== null && (
        <FindBar key={tab?.id} live={live} control={control} onClose={() => setFinding(false)} />
      )}
      {error !== undefined && (
        <p role="alert" className="border-b px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {download !== undefined && (
        <p
          role="status"
          className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs"
        >
          <Download className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {download} opens in your browser: the Browser doesn't save downloads.
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            onClick={() => setDownload(undefined)}
          >
            <X />
          </Button>
        </p>
      )}
      {native ? (
        <div className="relative min-h-0 flex-1">
          {live.loading && tabUrl !== null && (
            <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/20">
              <div className="h-full w-1/3 animate-[browser-loading_1.2s_ease-in-out_infinite] bg-primary" />
            </div>
          )}
          {pageTabs.map((each) => (
            <div
              key={each.id}
              className={cn(
                "absolute inset-0 flex flex-col",
                each.id !== memory.active && "pointer-events-none invisible",
              )}
            >
              <ViewportFrame
                viewport={each.viewport}
                zoom={each.zoom}
                onViewportChange={(viewport) =>
                  change((memory) => updateTab(memory, each.id, { viewport }))
                }
              >
                {(scale) => (
                  <WebviewTab
                    tabId={each.id}
                    url={each.url ?? "about:blank"}
                    zoom={scale}
                    onLive={onLive}
                    onNavigated={onNavigated}
                    onTitle={onTitle}
                    register={register}
                  />
                )}
              </ViewportFrame>
              <PageTrouble
                live={lives[each.id] ?? IDLE_TAB}
                onRetry={() => controllers.current.get(each.id)?.reload(false)}
              />
            </div>
          ))}
          {(tab === undefined || tabUrl === null) && (
            <div className="absolute inset-0 flex bg-background">
              <Offers
                offers={offers}
                servers={servers}
                terminalNames={terminalNames}
                onOpen={show}
              />
            </div>
          )}
        </div>
      ) : tab === undefined || tabUrl === null ? (
        <Offers offers={offers} servers={servers} terminalNames={terminalNames} onOpen={show} />
      ) : (
        <>
          <ViewportFrame
            viewport={tab.viewport}
            zoom={tab.zoom}
            onViewportChange={(viewport) =>
              change((memory) => updateTab(memory, tab.id, { viewport }))
            }
          >
            <iframe
              key={`${tab.id}:${reloads[tab.id] ?? 0}`}
              src={tabUrl}
              title={`Preview of ${tabUrl}`}
              sandbox={SANDBOX}
              onLoad={() => void checkFrame(tab.id, tabUrl)}
              className="h-full w-full border-0 bg-white"
            />
          </ViewportFrame>
          <FrameFooter url={tabUrl} notice={notices[tab.id]} />
        </>
      )}
    </div>
  )
}

/** A desktop page that failed to load or crashed for good, over the page, with a way back. */
function PageTrouble({ live, onRetry }: { readonly live: TabLive; readonly onRetry: () => void }) {
  if (live.failure === undefined && !live.crashed) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/95 p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <TriangleAlert className="size-6 text-warning" />
        <p className="text-sm font-medium">
          {live.crashed ? "This page crashed" : "This page didn't load"}
        </p>
        {live.failure !== undefined && (
          <p className="text-xs break-all text-muted-foreground">
            {live.failure.description}
            <br />
            {live.failure.url}
          </p>
        )}
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCw />
          {live.crashed ? "Reload" : "Try again"}
        </Button>
      </div>
    </div>
  )
}

function Toolbar({
  url,
  native,
  suggestions,
  error,
  onSubmit,
  leading,
  children,
}: {
  readonly url: string | null
  readonly native: boolean
  readonly suggestions: ReadonlyArray<string>
  readonly error: boolean
  readonly onSubmit: (input: string) => void
  readonly leading: ReactNode
  readonly children?: ReactNode
}) {
  const [draft, setDraft] = useState(url ?? "")
  const listId = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(draft)
  }
  return (
    <form onSubmit={submit} className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
      {leading}
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        list={listId}
        placeholder={native ? "localhost:3000 or any address" : "localhost:3000"}
        aria-label="Address"
        aria-invalid={error}
        spellCheck={false}
        autoComplete="off"
        className="h-7 min-w-0 flex-1 font-mono text-xs md:text-xs"
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      {children}
      {!native && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={url === null}
          onClick={() => url !== null && openOutside(url)}
          aria-label="Open in my browser"
          title="Open in my browser"
        >
          <ExternalLink />
        </Button>
      )}
    </form>
  )
}

function FrameFooter({
  url,
  notice,
}: {
  readonly url: string
  readonly notice: PreviewProbe | undefined
}) {
  const open = (
    <button
      type="button"
      className="underline underline-offset-2 hover:text-foreground"
      onClick={() => openOutside(url)}
    >
      Open in my browser
    </button>
  )
  if (notice !== undefined && notice._tag !== "Ok") {
    return (
      <p
        role="status"
        className="flex shrink-0 items-start gap-2 border-t bg-warning/10 px-3 py-1.5 text-xs"
      >
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <span>
          {notice.reason} {open}
        </span>
      </p>
    )
  }
  return (
    <p className="shrink-0 border-t px-3 py-1.5 text-xs text-muted-foreground">
      Blank or refusing? {open}. Back, forward, DevTools and any site need the desktop app.
    </p>
  )
}

function Offers({
  offers,
  servers,
  terminalNames,
  onOpen,
}: {
  readonly offers: ReadonlyArray<OfferedUrl>
  readonly servers: ReadonlyArray<LocalServer>
  readonly terminalNames: ReadonlyMap<string, string>
  readonly onOpen: (url: string) => void
}) {
  return (
    <Empty className="min-h-0 flex-1 overflow-y-auto">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Globe />
        </EmptyMedia>
        <EmptyTitle>Preview a local app</EmptyTitle>
        <EmptyDescription>
          {offers.length === 0 && servers.length === 0
            ? "Type an address above, such as localhost:3000. Servers your terminals start, and addresses the agent's commands print, show up here."
            : "Pick a running server or an address the terminals and the agent's commands printed."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-md">
        <ServerList servers={servers} terminalNames={terminalNames} onOpen={onOpen} />
      </EmptyContent>
      {offers.length > 0 && (
        <EmptyContent className="max-w-md">
          <h3 className="w-full text-left text-xs font-medium text-muted-foreground">
            Printed addresses
          </h3>
          <ul className="flex w-full flex-col gap-1">
            {offers.map((offer) => (
              <li key={offer.url}>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start font-mono text-xs"
                  onClick={() => onOpen(offer.url)}
                >
                  <span className="truncate">{offer.url}</span>
                </Button>
              </li>
            ))}
          </ul>
        </EmptyContent>
      )}
    </Empty>
  )
}
