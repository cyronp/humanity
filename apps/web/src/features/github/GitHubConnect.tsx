import type { GitHubConnection } from "@humanity/contracts"
import { type FormEvent, useId, useState } from "react"
import { ConnectOption } from "@/components/ConnectOption"
import { ErrorNote } from "@/components/ErrorNote"
import { CliSteps, ServiceConnect } from "@/components/ServiceConnect"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { installCliCommand, summarizeGitHub } from "./connection.ts"
import { GitHubIcon } from "./GitHubIcon.tsx"
import { useGitHubConnection } from "./useGitHubConnection.ts"

const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new"

/**
 * GitHub as the place repositories come from, and the two ways to connect
 * it: the GitHub CLI's login, or a token saved in Humanity.
 */
export function GitHubConnect() {
  const { result, refresh, refreshing, saveToken, removeToken } = useGitHubConnection()
  return (
    <ServiceConnect
      name="GitHub"
      icon={<GitHubIcon />}
      result={result}
      refresh={refresh}
      refreshing={refreshing}
      summary={summarizeGitHub}
      avatarUrl={(connection) => connection.user?.avatarUrl ?? null}
      problemTitle={() => "GitHub did not accept the login"}
    >
      {(connection, waiting) => (
        <>
          <CliOption connection={connection} waiting={waiting} />
          <TokenOption connection={connection} onSave={saveToken} onRemove={removeToken} />
        </>
      )}
    </ServiceConnect>
  )
}

function CliOption({
  connection,
  waiting,
}: {
  readonly connection: GitHubConnection
  readonly waiting: boolean
}) {
  return (
    <ConnectOption
      title="GitHub CLI"
      description="Sign in once in a terminal. Humanity asks the GitHub CLI for its login when it needs it and never stores it."
      inUse={connection.source === "cli"}
    >
      {connection.source === "cli" ? null : connection.source !== null ? (
        <p className="text-sm text-muted-foreground">
          Not needed while {connection.source === "token" ? "a saved token" : "GITHUB_TOKEN"} is in
          use.
        </p>
      ) : (
        <CliSteps
          cliName="GitHub CLI"
          installed={connection.cliInstalled}
          install={installCliCommand(navigator.userAgent)}
          installUrl="https://cli.github.com"
          installUrlLabel="cli.github.com"
          installFallback="Or download it from "
          service="GitHub"
          loginCommand="gh auth login"
          loginHint="Choose GitHub.com, then follow the browser window it opens."
          waiting={waiting}
        />
      )}
    </ConnectOption>
  )
}

function TokenOption({
  connection,
  onSave,
  onRemove,
}: {
  readonly connection: GitHubConnection
  /** Both resolve to an error message, or `undefined` when they worked. */
  readonly onSave: (token: string) => Promise<string | undefined>
  readonly onRemove: () => Promise<string | undefined>
}) {
  const inputId = useId()
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const saved = connection.source === "token"

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = token.trim()
    if (value === "" || busy) return
    setBusy(true)
    const failure = await onSave(value)
    setBusy(false)
    setError(failure)
    if (failure === undefined) setToken("")
  }

  const remove = async () => {
    setBusy(true)
    setError(await onRemove())
    setBusy(false)
  }

  return (
    <ConnectOption
      title="Access token"
      description="Paste a personal access token instead. A saved token is used before the GitHub CLI."
      inUse={saved}
    >
      {saved ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            A token is saved in a file in Humanity's data folder on this computer.
          </p>
          <Button variant="outline" size="sm" onClick={() => void remove()} disabled={busy}>
            Remove token
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <Field className="gap-2">
            <FieldLabel htmlFor={inputId}>Personal access token</FieldLabel>
            <div className="flex gap-2">
              <Input
                id={inputId}
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="github_pat_…"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <Button type="submit" disabled={busy || token.trim() === ""}>
                {busy ? "Checking…" : "Save token"}
              </Button>
            </div>
            <FieldDescription>
              <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer" className="underline">
                Create a fine-grained token
              </a>{" "}
              with read access to the contents and metadata of the repositories you want. Humanity
              checks it with GitHub, then keeps it in a file in its data folder, never in its
              database.
            </FieldDescription>
          </Field>
        </form>
      )}
      {error !== undefined && (
        <ErrorNote
          title={saved ? "Could not remove the token" : "Could not save the token"}
          message={error}
        />
      )}
    </ConnectOption>
  )
}
