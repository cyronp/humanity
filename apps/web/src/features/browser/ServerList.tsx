import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { LocalServer } from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { ChevronRight, CircleStop, SquareTerminal } from "lucide-react"
import { useMemo, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { daemonAddress } from "@/lib/connection"
import { describeCause } from "@/lib/errors"
import { localServersAtom, stopServerAtom } from "./atoms.ts"
import { refusedPorts } from "./browser.ts"

const EMPTY: ReadonlyArray<LocalServer> = []

export const useLocalServers = (fast: boolean): ReadonlyArray<LocalServer> => {
  const result = useAtomValue(localServersAtom(fast))
  const servers = AsyncResult.isSuccess(result) ? result.value : EMPTY
  return useMemo(() => {
    const refused = refusedPorts(window.location, daemonAddress())
    return servers.filter((server) => !refused.has(server.port))
  }, [servers])
}

export function ServerList({
  servers,
  terminalNames,
  onOpen,
}: {
  readonly servers: ReadonlyArray<LocalServer>
  readonly terminalNames: ReadonlyMap<string, string>
  readonly onOpen: (url: string) => void
}) {
  const stop = useAtomSet(stopServerAtom, { mode: "promiseExit" })
  const [stopping, setStopping] = useState<number>()
  const [asking, setAsking] = useState<LocalServer>()
  const [error, setError] = useState<string>()

  const stopNow = async (server: LocalServer) => {
    setError(undefined)
    setStopping(server.port)
    const exit = await stop({ payload: { pid: server.pid, port: server.port } })
    setStopping(undefined)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  const ours = servers.filter(
    (server) => server.terminalId !== null && terminalNames.has(server.terminalId),
  )
  const others = servers.filter((server) => !ours.includes(server))

  const row = (server: LocalServer) => {
    const terminal = server.terminalId === null ? undefined : terminalNames.get(server.terminalId)
    return (
      <li key={`${server.pid}:${server.port}`} className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="min-w-0 flex-1 justify-start gap-2 font-mono text-xs"
          onClick={() => onOpen(server.url)}
          title={server.url}
        >
          <span className="shrink-0">:{server.port}</span>
          <span className="truncate font-sans text-muted-foreground">
            {[server.processName, terminal].filter((part) => part != null).join(" · ")}
          </span>
          {terminal !== undefined && <SquareTerminal className="ml-auto text-muted-foreground" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={stopping === server.port}
          aria-label={`Stop the server on port ${server.port}`}
          title="Stop server"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => (server.terminalId === null ? setAsking(server) : void stopNow(server))}
        >
          <CircleStop />
          Stop
        </Button>
      </li>
    )
  }

  if (servers.length === 0) return null
  return (
    <div className="flex w-full flex-col gap-3 text-left">
      {ours.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">Running in this thread</h3>
          <ul className="flex flex-col gap-1">{ours.map(row)}</ul>
        </section>
      )}
      {others.length > 0 && (
        <details
          className="group/others flex flex-col gap-1"
          open={ours.length === 0 && others.length <= 3}
        >
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-open/others:rotate-90" />
            Other servers on this machine ({others.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">{others.map(row)}</ul>
        </details>
      )}
      {error !== undefined && <p className="text-xs text-destructive">{error}</p>}
      <AlertDialog
        open={asking !== undefined}
        onOpenChange={(open) => !open && setAsking(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Stop {asking?.processName ?? "this server"} on port {asking?.port}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              No terminal of Humanity's started it. Stopping it ends that program and everything it
              started.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (asking !== undefined) void stopNow(asking)
                setAsking(undefined)
              }}
            >
              Stop server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
