import { useEffect, useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { socketStore } from "@/lib/connection"
import { checkAuth, readToken } from "@/lib/token"

const GRACE_MS = 1500
const TOKEN_CHECK_MS = 5000

export function ConnectionBanner() {
  const state = useSyncExternalStore(socketStore.subscribe, socketStore.get)
  return state === "lost" ? <LostBanner /> : null
}

function LostBanner() {
  const [shown, setShown] = useState(false)
  const [rejected, setRejected] = useState(false)

  useEffect(() => {
    const show = window.setTimeout(() => setShown(true), GRACE_MS)
    const look = () =>
      void checkAuth(readToken()).then((status) => setRejected(status === "rejected"))
    const timer = window.setInterval(look, TOKEN_CHECK_MS)
    return () => {
      window.clearTimeout(show)
      window.clearInterval(timer)
    }
  }, [])

  if (!shown) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[calc(var(--titlebar-height)+--spacing(14))] left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-popover py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-md"
    >
      {rejected ? (
        <>
          <span>Humanity no longer accepts this browser's token.</span>
          <Button size="xs" className="rounded-full" onClick={() => window.location.reload()}>
            Enter a new token
          </Button>
        </>
      ) : (
        <>
          <Spinner aria-hidden="true" className="text-muted-foreground" />
          <span className="pr-1.5">Lost the connection to Humanity. Reconnecting…</span>
        </>
      )}
    </div>
  )
}
