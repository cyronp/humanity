import { GITLAB_DEFAULT_HOST } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { type FormEvent, type ReactNode, useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { GitHubIcon } from "@/features/github/GitHubIcon"
import { useGitHubConnection } from "@/features/github/useGitHubConnection"
import { GitLabIcon } from "@/features/gitlab/GitLabIcon"
import { useGitLabConnection } from "@/features/gitlab/useGitLabConnection"
import { usePollWhile } from "@/lib/usePollWhile"
import { RepositoryPicker } from "./RepositoryPicker.tsx"
import { ServiceRow, type ServiceState, TextButton } from "./ServiceRow.tsx"

type TokenSource = "token" | "cli" | "environment"

/** How a login reached Humanity, after the name of who it signs in as. */
const through = (source: TokenSource | null, cli: string, variable: string): string =>
  source === "cli" ? cli : source === "environment" ? variable : "access token"

/** Where repositories come from: whether GitHub and GitLab are connected, and which repositories to import. */
export function RepositoriesStep() {
  return (
    <div className="flex w-full flex-col gap-4">
      <h2 className="text-center text-xl font-semibold tracking-tight">Source Control</h2>
      <ul className="flex flex-col gap-2">
        <GitHubRow />
        <GitLabRow />
      </ul>
      <Separator />
      <RepositoryPicker />
    </div>
  )
}

function GitHubRow() {
  const { result, refresh, refreshing, saveToken } = useGitHubConnection()
  const connection = AsyncResult.isSuccess(result) ? result.value : undefined
  // Only while there is no token at all: then a check is a local lookup, no request to GitHub.
  const poll = useCallback(() => void refresh(), [refresh])
  usePollWhile(connection?.source === null, poll, refreshing)

  return (
    <Service
      icon={<GitHubIcon className="size-6" />}
      name="GitHub"
      pending={AsyncResult.isInitial(result)}
      user={connection?.user?.login}
      via={through(connection?.source ?? null, "GitHub CLI", "GITHUB_TOKEN")}
      placeholder="github_pat_…"
      onSave={saveToken}
    />
  )
}

function GitLabRow() {
  const { result, refresh, refreshing, saveToken } = useGitLabConnection()
  const connection = AsyncResult.isSuccess(result) ? result.value : undefined
  const poll = useCallback(() => void refresh(), [refresh])
  usePollWhile(connection?.source === null, poll, refreshing)
  // The guide connects gitlab.com; an instance of one's own is set in the settings.
  const save = useCallback((token: string) => saveToken(token, GITLAB_DEFAULT_HOST), [saveToken])

  return (
    <Service
      icon={<GitLabIcon className="size-6" />}
      name="GitLab"
      pending={AsyncResult.isInitial(result)}
      user={connection?.user?.username}
      via={through(connection?.source ?? null, "GitLab CLI", "GITLAB_TOKEN")}
      placeholder="glpat-…"
      onSave={save}
    />
  )
}

function Service({
  icon,
  name,
  pending,
  user,
  via,
  placeholder,
  onSave,
}: {
  readonly icon: ReactNode
  readonly name: string
  readonly pending: boolean
  /** Who the login signs in as; `undefined` when not connected. */
  readonly user: string | undefined
  readonly via: string
  readonly placeholder: string
  /** Resolves to an error message, or `undefined` when it worked. */
  readonly onSave: (token: string) => Promise<string | undefined>
}) {
  const [asking, setAsking] = useState(false)
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const state: ServiceState = pending
    ? undefined
    : user === undefined
      ? "disconnected"
      : "connected"

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = token.trim()
    if (value === "" || busy) return
    setBusy(true)
    const failure = await onSave(value)
    setBusy(false)
    setError(failure)
    if (failure === undefined) {
      setToken("")
      setAsking(false)
    }
  }

  return (
    <ServiceRow
      icon={icon}
      name={name}
      state={state}
      {...(user === undefined ? {} : { detail: `${user} · ${via}` })}
    >
      {state === "disconnected" &&
        (asking ? (
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={placeholder}
                aria-label={`${name} access token`}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="font-mono"
              />
              <Button type="submit" disabled={busy || token.trim() === ""}>
                {busy ? "Checking…" : "Connect"}
              </Button>
            </div>
            {error !== undefined && (
              <p role="alert" className="text-xs whitespace-pre-wrap text-destructive">
                {error}
              </p>
            )}
          </form>
        ) : (
          <TextButton onClick={() => setAsking(true)}>Connect using a token?</TextButton>
        ))}
    </ServiceRow>
  )
}
