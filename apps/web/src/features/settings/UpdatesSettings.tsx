import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { type UpdatePreferences, type UpdateStatus, type UpdateTrack } from "@humanity/contracts"
import { Exit } from "effect"
import { Download, ExternalLink, RefreshCw } from "lucide-react"
import { useId, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import {
  checkForUpdateAtom,
  installUpdateAtom,
  setUpdatePreferencesAtom,
  updateStatusAtom,
} from "@/features/updates/atoms"
import { describeUpdate, isUpdating } from "@/features/updates/describe"
import { describeCause } from "@/lib/errors"
import { APP_VERSION, RELEASES_URL } from "@/lib/version"
import {
  SettingsChoice,
  SettingsFrame,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"

const TRACKS = [
  { value: "stable", label: "Stable" },
  { value: "nightly", label: "Nightly" },
] as const satisfies ReadonlyArray<{ readonly value: UpdateTrack; readonly label: string }>

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

export function UpdatesSettings() {
  const status = useAtomValue(updateStatusAtom)

  return (
    <SettingsFrame id="settings-updates" title="Updates">
      <SettingsPane>
        <AsyncView result={status} errorTitle="Could not load the update status">
          {(value) => <UpdatesView status={value} />}
        </AsyncView>
      </SettingsPane>
    </SettingsFrame>
  )
}

function UpdatesView({ status }: { readonly status: UpdateStatus }) {
  const savePreferences = useAtomSet(setUpdatePreferencesAtom, { mode: "promiseExit" })
  const check = useAtomSet(checkForUpdateAtom, { mode: "promiseExit" })
  const install = useAtomSet(installUpdateAtom, { mode: "promiseExit" })
  const [error, setError] = useState<{ readonly title: string; readonly message: string }>()
  const autoCheckId = useId()
  const trackId = useId()
  const { preferences, state } = status
  const updating = isUpdating(state)

  const change = async (next: UpdatePreferences) => {
    setError(undefined)
    const exit = await savePreferences({ payload: { preferences: next } })
    if (Exit.isFailure(exit)) {
      setError({ title: "Could not save the update settings", message: describeCause(exit.cause) })
    }
  }

  const run = async (action: typeof check, title: string) => {
    setError(undefined)
    const exit = await action({ payload: undefined })
    if (Exit.isFailure(exit)) setError({ title, message: describeCause(exit.cause) })
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsRows>
        <SettingsRow
          label="Check automatically"
          labelId={autoCheckId}
          detail="Check for a new version when Humanity starts."
        >
          <Switch
            aria-labelledby={autoCheckId}
            checked={preferences.autoCheck}
            onCheckedChange={(autoCheck) => void change({ ...preferences, autoCheck })}
          />
        </SettingsRow>
        <SettingsRow
          label="Update track"
          labelId={trackId}
          detail={
            preferences.track === "nightly"
              ? "Untested builds of main. They may upgrade ~/.humanity/humanity.db past what stable can read, so back it up first."
              : "Tested releases only."
          }
        >
          <SettingsChoice
            labelledBy={trackId}
            options={TRACKS}
            value={preferences.track}
            disabled={updating}
            onChange={(track) => void change({ ...preferences, track })}
          />
        </SettingsRow>
        <SettingsRow
          label={`Version ${status.currentVersion ?? APP_VERSION ?? "unknown"}`}
          detail={<span aria-live="polite">{describeUpdate(state, formatTime)}</span>}
        >
          <UpdateButton
            status={status}
            onCheck={() => void run(check, "Could not look for updates")}
            onInstall={() => void run(install, "Could not install the update")}
          />
        </SettingsRow>
        <SettingsRow label="Release notes" detail="What changed in each version.">
          <Button variant="outline" size="sm" asChild>
            <a href={RELEASES_URL} target="_blank" rel="noreferrer">
              Open
              <ExternalLink />
            </a>
          </Button>
        </SettingsRow>
      </SettingsRows>
      {error !== undefined && <ErrorNote title={error.title} message={error.message} />}
    </div>
  )
}

function UpdateButton({
  status,
  onCheck,
  onInstall,
}: {
  readonly status: UpdateStatus
  readonly onCheck: () => void
  readonly onInstall: () => void
}) {
  const { state } = status
  switch (state._tag) {
    case "Available":
      return (
        <Button size="sm" onClick={onInstall}>
          <Download />
          Update to {state.version}
        </Button>
      )
    case "Downloading":
    case "Installing":
      return (
        <Button size="sm" disabled>
          <Spinner className="size-3.5" />
          {state._tag === "Downloading" ? `${Math.floor(state.percent)}%` : "Restarting"}
        </Button>
      )
    default:
      return (
        <Button
          variant="outline"
          size="sm"
          disabled={state._tag === "Unsupported" || state._tag === "Checking"}
          onClick={onCheck}
        >
          <RefreshCw className={state._tag === "Checking" ? "animate-spin" : undefined} />
          Check now
        </Button>
      )
  }
}
