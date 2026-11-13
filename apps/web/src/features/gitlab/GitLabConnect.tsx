import {
  GITLAB_DEFAULT_HOST,
  type GitLabConnection,
  normalizeGitLabHost,
} from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { type FormEvent, useCallback, useId, useState } from "react"
import { ConnectOption } from "@/components/ConnectOption"
import { CopyCommand } from "@/components/CopyCommand"
import { ErrorNote } from "@/components/ErrorNote"
import { NumberedStep } from "@/components/NumberedStep"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToneDot } from "@/features/claude/ToneDot"
import { describeCause } from "@/lib/errors"
import { usePollWhile } from "@/lib/usePollWhile"
import {
  gitlabSourcePhrase,
  installGlabCommand,
  newGitLabTokenUrl,
  summarizeGitLab,
} from "./connection.ts"
import { GitLabIcon } from "./GitLabIcon.tsx"
import { useGitLabConnection } from "./useGitLabConnection.ts"

const CLI_URL = "https://gitlab.com/gitlab-org/cli#installation"

/**
 * GitLab as a place repositories come from, on gitlab.com or an instance of
 * the human's own, and the two ways to connect it: the GitLab CLI's login, or
 * a token saved in Humanity.
 */
export function GitLabConnect() {
  const { result, refresh, refreshing, saveToken, removeToken } = useGitLabConnection()
  const [refreshError, setRefreshError] = useState<string>()
  const connection = AsyncResult.isSuccess(result) ? result.value : undefined
  // Only while there is no token at all: then a check is a local lookup, no request to GitLab.
  const waiting = connection !== undefined && connection.source === null
  const poll = useCallback(() => void refresh(), [refresh])
  usePollWhile(waiting, poll, refreshing)

  return (
    <section aria-labelledby="repositories-gitlab" className="flex flex-col">
      <div className="flex items-center gap-2 border-b pb-3">
        <GitLabIcon />
        <h3 id="repositories-gitlab" className="text-sm font-medium">
          GitLab
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
            Looking for a GitLab login on this computer.
          </p>
        ),
        onFailure: (failure) => (
          <div className="py-4">
            <ErrorNote
              title="Could not ask the daemon about GitLab"
              message={describeCause(failure.cause)}
            />
          </div>
        ),
        onSuccess: ({ value }) => (
          <div className="divide-y border-b">
            {value.problem !== null && (
              <div className="py-4">
                <ErrorNote
                  title={`${value.host} did not accept the login`}
                  message={value.problem}
                />
              </div>
            )}
            <CliOption connection={value} waiting={waiting} />
            {/* Keyed by what is saved, so the form starts over from the instance in use. */}
            <TokenOption
              key={`${value.source}:${value.host}`}
              connection={value}
              onSave={saveToken}
              onRemove={removeToken}
            />
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

function ConnectionLine({ connection }: { readonly connection: GitLabConnection }) {
  const summary = summarizeGitLab(connection)
  const avatar = connection.user?.avatarUrl ?? null
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {avatar === null ? (
        <ToneDot tone={summary.tone} />
      ) : (
        <img src={avatar} alt="" className="size-4 rounded-full" />
      )}
      <span className="truncate">{summary.title}</span>
    </span>
  )
}

function CliOption({
  connection,
  waiting,
}: {
  readonly connection: GitLabConnection
  readonly waiting: boolean
}) {
  const install = installGlabCommand(navigator.userAgent)
  const first = connection.cliInstalled ? 1 : 2
  return (
    <ConnectOption
      title="GitLab CLI"
      description="Sign in once in a terminal. Humanity asks the GitLab CLI for the login of its default instance when it needs it and never stores it."
      inUse={connection.source === "cli"}
    >
      {connection.source === "cli" ? null : connection.source !== null ? (
        <p className="text-sm text-muted-foreground">
          Not needed while {gitlabSourcePhrase(connection.source)} is in use.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {!connection.cliInstalled && (
            <NumberedStep n={1} title="Install the GitLab CLI">
              {install !== null && <CopyCommand command={install} className="mt-1" />}
              <span className="mt-1 block">
                {install === null ? "Follow the instructions at " : "Or see the other ways at "}
                <a href={CLI_URL} target="_blank" rel="noreferrer" className="underline">
                  gitlab.com/gitlab-org/cli
                </a>
                .
              </span>
            </NumberedStep>
          )}
          <NumberedStep n={first} title="Sign in to GitLab">
            <CopyCommand command="glab auth login" className="mt-1" />
            <span className="mt-1 block">
              Choose GitLab.com or your own instance, then follow what it asks.
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
    </ConnectOption>
  )
}

function TokenOption({
  connection,
  onSave,
  onRemove,
}: {
  readonly connection: GitLabConnection
  /** Both resolve to an error message, or `undefined` when they worked. */
  readonly onSave: (token: string, host: string) => Promise<string | undefined>
  readonly onRemove: () => Promise<string | undefined>
}) {
  const hostId = useId()
  const tokenId = useId()
  const [host, setHost] = useState(connection.host)
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const saved = connection.source === "token"
  // An empty field means gitlab.com; anything else has to be a host.
  const instance = host.trim() === "" ? GITLAB_DEFAULT_HOST : normalizeGitLabHost(host)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = token.trim()
    if (value === "" || instance === undefined || busy) return
    setBusy(true)
    const failure = await onSave(value, instance)
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
      description="Paste a personal access token instead, for gitlab.com or a GitLab instance of your own. A saved token is used before the GitLab CLI."
      inUse={saved}
    >
      {saved ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            A token for <span className="font-mono text-xs">{connection.host}</span> is saved in a
            file in Humanity's data folder on this computer.
          </p>
          <Button variant="outline" size="sm" onClick={() => void remove()} disabled={busy}>
            Remove token
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={hostId}>Instance</Label>
            <Input
              id={hostId}
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder={GITLAB_DEFAULT_HOST}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={instance === undefined}
              className="max-w-xs font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {instance === undefined
                ? "Enter the instance's host name, like gitlab.example.com."
                : "Leave gitlab.com, or enter the host of your own instance. It is reached over https."}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={tokenId}>Personal access token</Label>
            <div className="flex gap-2">
              <Input
                id={tokenId}
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="glpat-…"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <Button
                type="submit"
                disabled={busy || token.trim() === "" || instance === undefined}
              >
                {busy ? "Checking…" : "Save token"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {instance === undefined ? (
                "Create a token"
              ) : (
                <a
                  href={newGitLabTokenUrl(instance)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Create a token
                </a>
              )}{" "}
              with the <code>read_api</code> and <code>read_repository</code> scopes. Humanity
              checks it with that instance and only ever sends it there, then keeps it in a file in
              its data folder, never in its database.
            </p>
          </div>
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
