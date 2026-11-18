import { useAtomSet } from "@effect/atom-react"
import {
  type LocalServer,
  type OfferedUrl,
  type PreviewProbe,
  previewTarget,
} from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { ExternalLink, Globe, PanelRightClose, RotateCw, TriangleAlert } from "lucide-react"
import {
  type FormEvent,
  type ReactNode,
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
import { ServerList, useLocalServers } from "./ServerList.tsx"
import type { BrowserState } from "./useBrowser.ts"
import { ViewportFrame } from "./ViewportFrame.tsx"

const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"

const openOutside = (url: string) => void window.open(url, "_blank", "noopener,noreferrer")

/**
 * The Browser tool: tabs of local pages in frames, each at the panel's size or a device's. It stays
 * mounted while another shelf tool shows, so switching tools doesn't reload the previewed app.
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
  const refused = useMemo(() => refusedPorts(window.location, daemonAddress()), [])
  const tab = activeTab(memory)
  const servers = useLocalServers(shown)
  const [error, setError] = useState<string>()
  const [reloads, setReloads] = useState<Readonly<Record<string, number>>>({})
  const [notices, setNotices] = useState<Readonly<Record<string, PreviewProbe | undefined>>>({})
  const probe = useAtomSet(probeAtom, { mode: "promiseExit" })
  const latest = useRef(memory)
  useLayoutEffect(() => {
    latest.current = memory
  })

  const reload = (id: string) => {
    setNotices((current) => ({ ...current, [id]: undefined }))
    setReloads((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }))
  }

  /** Loads what the human typed into the shown tab, or into a new one. */
  const navigate = (input: string) => {
    const target = previewTarget(input, refused)
    if (target._tag === "Refused") {
      setError(target.reason)
      return
    }
    setError(undefined)
    const current = activeTab(latest.current)
    if (current === undefined) {
      change((memory) => openTab(memory, target.url))
      return
    }
    change((memory) => updateTab(memory, current.id, { url: target.url, title: null }))
    reload(current.id)
  }

  /** Shows an address a link or a button asked for, reloading a tab that already shows it. */
  const show = (input: string) => {
    const target = previewTarget(input, refused)
    if (target._tag === "Refused") {
      setError(target.reason)
      return
    }
    setError(undefined)
    const showing = latest.current.tabs.find((each) => each.url === target.url)
    change((memory) => openUrl(memory, target.url))
    if (showing !== undefined) reload(showing.id)
  }
  const showRequested = useEffectEvent(show)

  useEffect(() => {
    const take = () => {
      const request = takePreviewRequest()
      if (request !== undefined) showRequested(request.url)
    }
    take()
    return onPreviewPending(take)
  }, [])

  useEffect(() => {
    if (shown) onSeen()
  }, [shown, onSeen])

  const checkFrame = async (id: string, loaded: string) => {
    const exit = await probe({ payload: { url: loaded, embedder: window.location.origin } })
    const notice = Exit.isSuccess(exit) && exit.value._tag !== "Ok" ? exit.value : undefined
    setNotices((current) => ({ ...current, [id]: notice }))
  }

  const notice = tab === undefined ? undefined : notices[tab.id]
  const tabUrl = tab?.url ?? null

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", !shown && "hidden")}>
      <div
        className="titlebar flex h-12 shrink-0 items-center gap-1 border-b px-2"
        style={{ paddingRight: titlebarPadding }}
      >
        <h2 className="sr-only">Browser</h2>
        <TabStrip
          tabs={memory.tabs}
          active={memory.active}
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
        suggestions={[
          ...new Set([...servers.map((server) => server.url), ...offers.map((offer) => offer.url)]),
        ]}
        error={error !== undefined}
        onSubmit={navigate}
        onReload={() => tab !== undefined && reload(tab.id)}
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
          </>
        )}
      </Toolbar>
      {error !== undefined && (
        <p role="alert" className="border-b px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {tab === undefined || tabUrl === null ? (
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
          <FrameFooter url={tabUrl} notice={notice} />
        </>
      )}
    </div>
  )
}

function Toolbar({
  url,
  suggestions,
  error,
  onSubmit,
  onReload,
  children,
}: {
  readonly url: string | null
  readonly suggestions: ReadonlyArray<string>
  readonly error: boolean
  readonly onSubmit: (input: string) => void
  readonly onReload: () => void
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
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => (url === null ? onSubmit(draft) : onReload())}
        aria-label="Reload"
        title="Reload"
      >
        <RotateCw />
      </Button>
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        list={listId}
        placeholder="localhost:3000"
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
      Blank or refusing? {open}.
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
