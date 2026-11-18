import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { type BrowserLinkTarget, type BrowserPreferences } from "@humanity/contracts"
import { Exit } from "effect"
import { useId, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { browserPreferencesAtom, setBrowserPreferencesAtom } from "@/features/browser/atoms"
import { isMac } from "@/features/terminal/keys"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { SettingsFrame, SettingsPane, SettingsRow, SettingsRows } from "./SettingsLayout.tsx"

export function BrowserSettings() {
  const result = useAtomValue(browserPreferencesAtom)
  return (
    <SettingsFrame
      id="settings-browser"
      title="Browser"
      description="The Browser on a thread's shelf shows the app you or the agent are running."
    >
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
      </SettingsRows>
      {error !== undefined && <ErrorNote title="Couldn't save" message={error} />}
    </div>
  )
}
