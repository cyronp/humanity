import { type ReactNode, useCallback, useEffect, useState } from "react"
import { BrandMark } from "@/components/BrandMark"
import { ConnectionBanner } from "@/components/ConnectionBanner"
import { TokenScreen, UnreachableScreen } from "@/components/connect/ConnectScreens"
import { type AuthStatus, checkAuth, readToken } from "@/lib/token"

/**
 * Nothing behind this renders until the daemon has accepted the token, so the
 * RPC socket is only ever opened with a token that is known to work.
 *
 * A daemon that is down and a token that is missing or wrong are different
 * problems with different fixes, so each gets a screen of its own: the first
 * keeps looking for the daemon on its own, the others ask for the token.
 */
export function AuthGate({ children }: { readonly children: ReactNode }) {
  // `undefined` until the first check answers, which shows the splash.
  const [status, setStatus] = useState<AuthStatus>()
  const [checking, setChecking] = useState(true)
  // Checks in a row that found no daemon, which spaces out the next one.
  const [failures, setFailures] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void checkAuth(readToken()).then((next) => {
      if (cancelled) return
      setStatus(next)
      setChecking(false)
      setFailures((n) => (next === "unreachable" ? n + 1 : 0))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const check = useCallback(() => {
    setChecking(true)
    setAttempt((n) => n + 1)
  }, [])

  // Coming back to the window or the network is a good moment to look again.
  useEffect(() => {
    if (status !== "unreachable") return
    window.addEventListener("focus", check)
    window.addEventListener("online", check)
    return () => {
      window.removeEventListener("focus", check)
      window.removeEventListener("online", check)
    }
  }, [status, check])

  if (status === undefined) return <Loading />
  if (status === "ok") {
    return (
      <>
        {children}
        <ConnectionBanner />
      </>
    )
  }
  return status === "unreachable" ? (
    <UnreachableScreen checking={checking} failures={failures} onRetry={check} />
  ) : (
    <TokenScreen rejected={status === "rejected"} checking={checking} onSubmit={check} />
  )
}

/**
 * The brand mark alone, centered on the sidebar's colour: the same picture as
 * the page before the app renders and as the desktop app while it starts.
 */
function Loading() {
  return (
    <main
      role="status"
      aria-label="Connecting to the Humanity daemon"
      className="titlebar fixed inset-0 grid place-items-center bg-sidebar"
    >
      <BrandMark className="size-24" />
    </main>
  )
}
