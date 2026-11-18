import { type ReactNode, useCallback, useEffect, useState } from "react"
import { BrandMark } from "@/components/BrandMark"
import { ConnectionBanner } from "@/components/ConnectionBanner"
import { TokenScreen, UnreachableScreen } from "@/components/connect/ConnectScreens"
import { type AuthStatus, checkAuth, readToken } from "@/lib/token"

export function AuthGate({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>()
  const [checking, setChecking] = useState(true)
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
