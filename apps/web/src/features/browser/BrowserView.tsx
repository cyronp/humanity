import {
  type LocalServer,
  type OfferedUrl,
  type PreviewProbe,
  previewTarget,
} from "@humanity/contracts"
import { cn } from "cn"
import { useAtomSet } from "@effect/atom-react"
import { Exit } from "effect"
import { ExternalLink, Globe, PanelRightClose, RotateCw, TriangleAlert } from "lucide-react"
import { type FormEvent, useEffect, useEffectEvent, useId, useMemo, useState } from "react"
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
import { onPreviewRequest, refusedPorts, takePreviewRequest } from "./browser.ts"
import { ServerList, useLocalServers } from "./ServerList.tsx"

const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"

const openOutside = (url: string) => void window.open(url, "_blank", "noopener,noreferrer")

/**
 * The Browser tool: a preview of a local address in a frame, with its own bar. It stays mounted
 * while another shelf tool shows, so switching tools doesn't reload the previewed app.
 */
export function BrowserView({
  remembered,
  shown,
  offers,
  terminalNames,
  onLoad,
  onSeen,
  onClose,
  titlebarPadding,
}: {
  readonly remembered: string | null
  readonly shown: boolean
  readonly offers: ReadonlyArray<OfferedUrl>
  readonly terminalNames: ReadonlyMap<string, string>
  readonly onLoad: (url: string) => void
  readonly onSeen: () => void
  readonly onClose: () => void
  readonly titlebarPadding: string
}) {
  const refused = useMemo(() => refusedPorts(window.location, daemonAddress()), [])
  const [url, setUrl] = useState<string | null>(() => {
    if (remembered === null) return null
    const target = previewTarget(remembered, refused)
    return target._tag === "Url" ? target.url : null
  })
  const [draft, setDraft] = useState(url ?? "")
  const [error, setError] = useState<string>()
  const [reloads, setReloads] = useState(0)
  const listId = useId()
  const servers = useLocalServers(shown)
  const suggestions = [
    ...new Set([...servers.map((server) => server.url), ...offers.map((offer) => offer.url)]),
  ]
  const probe = useAtomSet(probeAtom, { mode: "promiseExit" })
  const [notice, setNotice] = useState<PreviewProbe>()
  const checkFrame = async (loaded: string) => {
    const exit = await probe({ payload: { url: loaded, embedder: window.location.origin } })
    setNotice(Exit.isSuccess(exit) && exit.value._tag !== "Ok" ? exit.value : undefined)
  }

  const load = (input: string) => {
    const target = previewTarget(input, refused)
    if (target._tag === "Refused") {
      setDraft(input)
      setError(target.reason)
      return
    }
    setError(undefined)
    setNotice(undefined)
    setDraft(target.url)
    setUrl(target.url)
    setReloads((count) => count + 1)
    onLoad(target.url)
  }
  const loadRequested = useEffectEvent(load)

  useEffect(() => {
    const take = () => {
      const request = takePreviewRequest()
      if (request !== undefined) loadRequested(request.url)
    }
    take()
    return onPreviewRequest(take)
  }, [])

  useEffect(() => {
    if (shown) onSeen()
  }, [shown, offers, onSeen])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    load(draft)
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", !shown && "hidden")}>
      <div
        className="titlebar flex h-12 shrink-0 items-center gap-2 border-b px-3"
        style={{ paddingRight: titlebarPadding }}
      >
        <h2 className="sr-only">Browser</h2>
        <form onSubmit={submit} className="min-w-0 flex-1">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            list={listId}
            placeholder="localhost:3000"
            aria-label="Address"
            aria-invalid={error !== undefined}
            spellCheck={false}
            autoComplete="off"
            className="h-7 font-mono text-xs md:text-xs"
          />
          <datalist id={listId}>
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </form>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (url === null) return load(draft)
              setNotice(undefined)
              setReloads((count) => count + 1)
            }}
            aria-label="Reload"
            title="Reload"
          >
            <RotateCw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={url === null}
            onClick={() => url !== null && openOutside(url)}
            aria-label="Open in my browser"
            title="Open in my browser"
          >
            <ExternalLink />
          </Button>
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
      </div>
      {error !== undefined && (
        <p role="alert" className="border-b px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {url === null ? (
        <Offers offers={offers} servers={servers} terminalNames={terminalNames} onOpen={load} />
      ) : (
        <>
          <iframe
            key={reloads}
            src={url}
            title={`Preview of ${url}`}
            sandbox={SANDBOX}
            onLoad={() => void checkFrame(url)}
            className="min-h-0 w-full flex-1 border-0 bg-white"
          />
          {notice !== undefined && notice._tag !== "Ok" ? (
            <p
              role="status"
              className="flex shrink-0 items-start gap-2 border-t bg-warning/10 px-3 py-1.5 text-xs"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                {notice.reason}{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => openOutside(url)}
                >
                  Open in my browser
                </button>
              </span>
            </p>
          ) : (
            <p className="shrink-0 border-t px-3 py-1.5 text-xs text-muted-foreground">
              Blank or refusing?{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => openOutside(url)}
              >
                Open in my browser
              </button>
              .
            </p>
          )}
        </>
      )}
    </div>
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
    <Empty className="min-h-0 flex-1">
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
