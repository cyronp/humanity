import type { GitHubConnection } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { type FormEvent, type ReactNode, useCallback, useId, useState } from "react"
import { CopyCommand } from "@/components/CopyCommand"
import { ErrorNote } from "@/components/ErrorNote"
import { NumberedStep } from "@/components/NumberedStep"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToneDot } from "@/features/claude/ToneDot"
import { describeCause } from "@/lib/errors"
import { usePollWhile } from "@/lib/usePollWhile"
import { installCliCommand, summarizeGitHub } from "./connection.ts"
import { GitHubIcon } from "./GitHubIcon.tsx"
import { useGitHubConnection } from "./useGitHubConnection.ts"

const CLI_URL = "https://cli.github.com"
const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new"

/**
 * GitHub as the place repositories come from, and the two ways to connect
 * it: the GitHub CLI's login, or a token saved in Humanity.
 */
export function GitHubConnect() {
  const { result, refresh, refreshing, saveToken, removeToken } = useGitHubConnection()
  const [refreshError, setRefreshError] = useState<string>()
  const connection = AsyncResult.isSuccess(result) ? result.value : undefined
  // Only while there is no token at all: then a check is one local lookup, no request to GitHub.
  const waiting = connection !== undefined && connection.source === null
  const poll = useCallback(() => void refresh(), [refresh])
  usePollWhile(waiting, poll, refreshing)

  return (
    <section aria-labelledby="repositories-github" className="flex flex-col">
      <div className="flex items-center gap-2 border-b pb-3">
        <GitHubIcon />
        <h3 id="repositories-github" className="text-sm font-medium">
          GitHub
        </h3>
        {connection !== undefined && <ConnectionLine connection={connection} />}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void refresh().then(setRefreshError)}
          disabled={refreshing || connection === undefined}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          {refreshing ? "Checking…" : "Check again"}
        </Button>
      </div>

      {AsyncResult.match(result, {
        onInitial: () => (
          <p className="flex items-center gap-2 border-b py-4 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Looking for a GitHub login on this computer.
          </p>
        ),
        onFailure: (failure) => (
          <div className="py-4">
            <ErrorNote
              title="Could not ask the daemon about GitHub"
              message={describeCause(failure.cause)}
            />
          </div>
        ),
        onSuccess: ({ value }) => (
          <div className="divide-y border-b">
            {value.problem !== null && (
              <div className="py-4">
                <ErrorNote title="GitHub did not accept the login" message={value.problem} />
              </div>
            )}
            <CliOption connection={value} waiting={waiting} />
            <TokenOption connection={value} onSave={saveToken} onRemove={removeToken} />
          </div>
        ),
      })}
      {refreshError !== undefined && (
        <div className="pt-4">
          <ErrorNote title="Could not check again" message={refreshError} />
        </div>
      )}
    </section>
  )
}

function ConnectionLine({ connection }: { readonly connection: GitHubConnection }) {
  const summary = summarizeGitHub(connection)
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {connection.user === null ? (
        <ToneDot tone={summary.tone} />
      ) : (
        <img src={connection.user.avatarUrl} alt="" className="size-4 rounded-full" />
      )}
      <span className="truncate">{summary.title}</span>
    </span>
  )
}

/** One of the ways to connect: what it is, whether it is the one in use, and what to do. */
function Option({
  title,
  description,
  inUse,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly inUse: boolean
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">{title}</h4>
          {inUse && <Badge>In use</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

function CliOption({
  connection,
  waiting,
}: {
  readonly connection: GitHubConnection
  readonly waiting: boolean
}) {
  const install = installCliCommand(navigator.userAgent)
  const first = connection.cliInstalled ? 1 : 2
  return (
    <Option
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
        <ol className="flex flex-col gap-4">
          {!connection.cliInstalled && (
            <NumberedStep n={1} title="Install the GitHub CLI">
              {install !== null && <CopyCommand command={install} className="mt-1" />}
              <span className="mt-1 block">
                {install === null ? "Follow the instructions at " : "Or download it from "}
                <a href={CLI_URL} target="_blank" rel="noreferrer" className="underline">
                  cli.github.com
                </a>
                .
              </span>
            </NumberedStep>
          )}
          <NumberedStep n={first} title="Sign in to GitHub">
            <CopyCommand command="gh auth login" className="mt-1" />
            <span className="mt-1 block">
              Choose GitHub.com, then follow the browser window it opens.
            </span>
          </NumberedStep>
          <NumberedStep n={first + 1} title="Come back here">
            {waiting ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="size-3.5 animate-spin" />
                This page checks again every few seconds and updates once you are signed in.
              </span>
            ) : (
              "Press Check again once you are signed in."
            )}
          </NumberedStep>
        </ol>
      )}
    </Option>
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
    <Option
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
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
          <Label htmlFor={inputId}>Personal access token</Label>
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
          <p className="text-xs text-muted-foreground">
            <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer" className="underline">
              Create a fine-grained token
            </a>{" "}
            with read access to the contents and metadata of the repositories you want. Humanity
            checks it with GitHub, then keeps it in a file in its data folder, never in its
            database.
          </p>
        </form>
      )}
      {error !== undefined && (
        <ErrorNote
          title={saved ? "Could not remove the token" : "Could not save the token"}
          message={error}
        />
      )}
    </Option>
  )
}
