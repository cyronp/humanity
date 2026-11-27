import { ErrorNote } from "@/components/ErrorNote"
import { useHistoryImport } from "@/features/onboarding/historyImport"
import { SwitchSetting } from "./SettingsFields.tsx"

export function HistoryImportSetting() {
  const { enabled, ready, setEnabled, error } = useHistoryImport()
  return (
    <SwitchSetting
      label="Import my Claude Code threads"
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
      checked={enabled}
      disabled={!ready}
      onCheckedChange={(next) => void setEnabled(next)}
    />
  )
}
