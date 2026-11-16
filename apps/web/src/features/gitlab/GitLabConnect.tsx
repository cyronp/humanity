import {
  GITLAB_DEFAULT_HOST,
  type GitLabConnection,
  normalizeGitLabHost,
} from "@humanity/contracts"
import { type FormEvent, useId, useState } from "react"
import { ConnectOption } from "@/components/ConnectOption"
import { ErrorNote } from "@/components/ErrorNote"
import { CliSteps, ServiceConnect } from "@/components/ServiceConnect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  gitlabSourcePhrase,
  installGlabCommand,
  newGitLabTokenUrl,
  summarizeGitLab,
} from "./connection.ts"
import { GitLabIcon } from "./GitLabIcon.tsx"
import { useGitLabConnection } from "./useGitLabConnection.ts"

/**
 * GitLab as a place repositories come from, on gitlab.com or an instance of
 * the human's own, and the two ways to connect it: the GitLab CLI's login, or
 * a token saved in Humanity.
 */
export function GitLabConnect() {
  const { result, refresh, refreshing, saveToken, removeToken } = useGitLabConnection()
  return (
    <ServiceConnect
      name="GitLab"
      icon={<GitLabIcon />}
      result={result}
      refresh={refresh}
      refreshing={refreshing}
      summary={summarizeGitLab}
      avatarUrl={(connection) => connection.user?.avatarUrl ?? null}
      problemTitle={(connection) => `${connection.host} did not accept the login`}
    >
      {(connection, waiting) => (
        <>
          <CliOption connection={connection} waiting={waiting} />
          {/* Keyed by what is saved, so the form starts over from the instance in use. */}
          <TokenOption
            key={`${connection.source}:${connection.host}`}
            connection={connection}
            onSave={saveToken}
            onRemove={removeToken}
          />
        </>
      )}
    </ServiceConnect>
  )
}

function CliOption({
  connection,
  waiting,
}: {
  readonly connection: GitLabConnection
  readonly waiting: boolean
}) {
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
        <CliSteps
          cliName="GitLab CLI"
          installed={connection.cliInstalled}
          install={installGlabCommand(navigator.userAgent)}
          installUrl="https://gitlab.com/gitlab-org/cli#installation"
          installUrlLabel="gitlab.com/gitlab-org/cli"
          installFallback="Or see the other ways at "
          service="GitLab"
          loginCommand="glab auth login"
          loginHint="Choose GitLab.com or your own instance, then follow what it asks."
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
          <Field className="gap-2">
            <FieldLabel htmlFor={hostId}>Instance</FieldLabel>
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
            <FieldDescription>
              {instance === undefined
                ? "Enter the instance's host name, like gitlab.example.com."
                : "Leave gitlab.com, or enter the host of your own instance. It is reached over https."}
            </FieldDescription>
          </Field>
          <Field className="gap-2">
            <FieldLabel htmlFor={tokenId}>Personal access token</FieldLabel>
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
            <FieldDescription>
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
