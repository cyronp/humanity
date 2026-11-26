import { useId } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Switch } from "@/components/ui/switch"
import { useHistoryImport } from "@/features/onboarding/historyImport"
import { SettingsRow } from "./SettingsLayout.tsx"

export function HistoryImportSetting() {
  const { enabled, ready, setEnabled, error } = useHistoryImport()
  const labelId = useId()
  return (
    <SettingsRow
      label="Import my Claude Code threads"
      labelId={labelId}
      detail={
        <>
          Lists the conversations you had in Claude Code's own terminal as threads of each project,
          kept up to date. Nothing is written to Claude Code's files.
          {error !== undefined && (
            <span className="mt-2 block">
              <ErrorNote title="The setting was not saved" message={error} />
            </span>
          )}
        </>
      }
    >
      <Switch
        aria-labelledby={labelId}
        checked={enabled}
        disabled={!ready}
        onCheckedChange={(next) => void setEnabled(next)}
      />
    </SettingsRow>
  )
}
