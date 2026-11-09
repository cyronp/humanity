import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type AuthStatus, checkAuth, readToken, storeToken, tokenFromInput } from "@/lib/token"

type GateState = AuthStatus | "checking"

/**
 * Nothing behind this renders until the daemon has accepted the token, so the
 * RPC socket is only ever opened with a token that is known to work.
 */
export function AuthGate({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void checkAuth(readToken()).then((status) => {
      if (!cancelled) setState(status)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = () => {
    setState("checking")
    setAttempt((n) => n + 1)
  }

  if (state === "ok") return children
  if (state === "checking") {
    return <CenteredNote>Connecting to the Humanity daemon…</CenteredNote>
  }
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Connect to Humanity</CardTitle>
          <CardDescription>
            The daemon prints a link with a token when it starts. Open that link, or paste it here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state === "unreachable" ? (
            <Alert variant="destructive">
              <AlertTitle>The daemon is not answering</AlertTitle>
              <AlertDescription>
                Start it with <code>npm run dev</code> (or <code>npm start</code>) and try again.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>A valid token is required</AlertTitle>
              <AlertDescription>
                The token is also stored in <code>~/.humanity/auth-token</code>.
              </AlertDescription>
            </Alert>
          )}
          <TokenForm onSubmit={retry} />
        </CardContent>
      </Card>
    </main>
  )
}

function TokenForm({ onSubmit }: { readonly onSubmit: () => void }) {
  const [value, setValue] = useState("")
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (value.trim() !== "") storeToken(tokenFromInput(value))
    onSubmit()
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="token">Token or link</Label>
      <div className="flex gap-2">
        <Input
          id="token"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="http://127.0.0.1:7420/?token=…"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit">Connect</Button>
      </div>
    </form>
  )
}

function CenteredNote({ children }: { readonly children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </main>
  )
}
