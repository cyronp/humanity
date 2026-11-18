import { useId } from "react"
import { useThemeChoice } from "@/lib/theme"
import {
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"
import { ThemePicker } from "./ThemePicker.tsx"

export function GeneralSettings() {
  return (
    <SettingsFrame id="settings-general" title="General">
      <SettingsPane>
        <SettingsGroup title="Appearance">
          <SettingsRows>
            <ThemeSetting />
          </SettingsRows>
        </SettingsGroup>
      </SettingsPane>
    </SettingsFrame>
  )
}

function ThemeSetting() {
  const [choice, choose] = useThemeChoice()
  const labelId = useId()

  return (
    <SettingsRow label="Theme" labelId={labelId} stacked>
      <ThemePicker labelledBy={labelId} value={choice} onChange={choose} />
    </SettingsRow>
  )
}
