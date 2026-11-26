import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  type BrowserAppearance,
  type BrowserLinkTarget,
  type BrowserPreferences,
  FILL_DEVICE,
  PREVIEW_DEVICES,
  ZOOM_LEVELS,
  plural,
} from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { FolderOpen, Trash2 } from "lucide-react"
import { useId, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { browserPreferencesAtom, setBrowserPreferencesAtom } from "@/features/browser/atoms"
import { ConfirmRemove } from "@/features/extensions/ConfirmRemove"
import { desktopPreview } from "@/features/browser/desktop"
import {
  clearRecordingsAtom,
  formatBytes,
  openFolderAtom,
  recordingsAtom,
} from "@/features/system/atoms"
import { isMac } from "@/features/terminal/keys"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import {
  SettingsChoice,
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"

const APPEARANCES: ReadonlyArray<{ readonly value: BrowserAppearance; readonly label: string }> = [
  { value: "system", label: "Page's own" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

const CATEGORIES = ["Phone", "Tablet", "Desktop"] as const

export function BrowserSettings() {
  const result = useAtomValue(browserPreferencesAtom)
  return (
    <SettingsFrame id="settings-browser" title="Browser">
      <SettingsPane>
        <AsyncView result={result} errorTitle="Couldn't load the Browser settings">
          {(preferences) => <BrowserView preferences={preferences} />}
        </AsyncView>
      </SettingsPane>
    </SettingsFrame>
  )
}

function BrowserView({ preferences }: { readonly preferences: BrowserPreferences }) {
  const save = useAtomSet(setBrowserPreferencesAtom, { mode: "promiseExit" })
  const [error, setError] = useState<string>()
  const linkId = useId()
  const offerId = useId()
  const deviceId = useId()
  const zoomId = useId()
  const appearanceId = useId()
  const desktop = desktopPreview() !== undefined

  const change = async (patch: Partial<BrowserPreferences>) => {
    setError(undefined)
    const exit = await save({
      payload: { browser: { ...preferences, ...patch } },
      reactivityKeys: [keys.preferences],
    })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup>
        <SettingsRows>
          <SettingsRow
            label="Open local links in"
            labelId={linkId}
            detail={`Where a local address clicked in a terminal or in a command's output opens. ${isMac() ? "⌘" : "Ctrl"}-click or a middle click always opens your browser.`}
          >
            <Select
              value={preferences.linkTarget}
              onValueChange={(linkTarget) =>
                void change({ linkTarget: linkTarget as BrowserLinkTarget })
              }
            >
              <SelectTrigger className="w-56" aria-labelledby={linkId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="browser">The thread's Browser</SelectItem>
                <SelectItem value="system">My browser</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            label="Point out local addresses"
            labelId={offerId}
            detail="Badges the Browser's icon when a terminal or a command prints an address you haven't opened."
          >
            <Switch
              aria-labelledby={offerId}
              checked={preferences.offerLocalAddresses}
              onCheckedChange={(offerLocalAddresses) => void change({ offerLocalAddresses })}
            />
          </SettingsRow>
        </SettingsRows>
      </SettingsGroup>

      <SettingsGroup title="New tabs">
        <SettingsRows>
          <SettingsRow label="Device size" labelId={deviceId}>
            <Select value={preferences.device} onValueChange={(device) => void change({ device })}>
              <SelectTrigger className="w-56" aria-labelledby={deviceId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILL_DEVICE}>Fill the panel</SelectItem>
                {CATEGORIES.map((category) => (
                  <SelectGroup key={category}>
                    <SelectLabel>{category}</SelectLabel>
                    {PREVIEW_DEVICES.filter((device) => device.category === category).map(
                      (device) => (
                        <SelectItem key={device.id} value={device.id}>
                          {device.label}
                          <span className="text-muted-foreground">
                            {device.width}×{device.height}
                          </span>
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow label="Zoom" labelId={zoomId}>
            <Select
              value={String(preferences.zoom)}
              onValueChange={(zoom) => void change({ zoom: Number(zoom) })}
            >
              <SelectTrigger className="w-28" aria-labelledby={zoomId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZOOM_LEVELS.map((level) => (
                  <SelectItem key={level} value={String(level)}>
                    {Math.round(level * 100)}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            label="Appearance"
            labelId={appearanceId}
            detail={
              desktop
                ? "The light or dark mode a page is asked to show."
                : "The light or dark mode a page is asked to show. Needs the desktop app."
            }
          >
            <SettingsChoice
              labelledBy={appearanceId}
              options={APPEARANCES}
              value={preferences.appearance}
              disabled={!desktop}
              onChange={(appearance) => void change({ appearance })}
            />
          </SettingsRow>
        </SettingsRows>
      </SettingsGroup>

      <SettingsGroup title="Data">
        <BrowserData desktop={desktop} />
      </SettingsGroup>
      {error !== undefined && <ErrorNote title="Couldn't save" message={error} />}
    </div>
  )
}

function BrowserData({ desktop }: { readonly desktop: boolean }) {
  const recordings = useAtomValue(recordingsAtom)
  const openFolder = useAtomSet(openFolderAtom, { mode: "promiseExit" })
  const clearRecordings = useAtomSet(clearRecordingsAtom, { mode: "promiseExit" })
  const [cleared, setCleared] = useState(false)
  const [error, setError] = useState<string>()
  const usage = AsyncResult.isSuccess(recordings) ? recordings.value : undefined

  const clearData = async () => {
    setError(undefined)
    try {
      await desktopPreview()?.clearData()
      setCleared(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const run = async (action: () => Promise<Exit.Exit<unknown, unknown>>) => {
    setError(undefined)
    const exit = await action()
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsRows>
        <SettingsRow
          label="Cookies and cache"
          detail={
            desktop
              ? cleared
                ? "Cleared. Pages sign in again on their next load."
                : "Signs every page of the Browser out and forgets what it cached."
              : "Kept by the desktop app only."
          }
        >
          <Button variant="outline" size="sm" disabled={!desktop} onClick={() => void clearData()}>
            <Trash2 />
            Clear
          </Button>
        </SettingsRow>
        <SettingsRow
          label="Recordings"
          detail={
            usage === undefined
              ? "Recordings of pages, kept under ~/.humanity/recordings."
              : usage.files === 0
                ? "No recordings kept."
                : `${plural(usage.files, "file")}, ${formatBytes(usage.bytes)}, under ~/.humanity/recordings.`
          }
        >
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void run(() => openFolder({ payload: { folder: "recordings" } }))}
            >
              <FolderOpen />
              Open
            </Button>
            {usage !== undefined && usage.files > 0 && (
              <ConfirmRemove
                label="Delete every recording"
                title="Delete every recording?"
                description={`The ${plural(usage.files, "file")} under ~/.humanity/recordings are deleted for good.`}
                onConfirm={async () => {
                  const exit = await clearRecordings({
                    payload: undefined,
                    reactivityKeys: [keys.recordings],
                  })
                  return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
                }}
              />
            )}
          </div>
        </SettingsRow>
      </SettingsRows>
      {error !== undefined && <ErrorNote title="That didn't work" message={error} />}
    </div>
  )
}
