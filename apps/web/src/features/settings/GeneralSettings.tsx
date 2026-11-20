import { useId } from "react"
import { useColorTheme, useThemeChoice } from "@/lib/theme"
import {
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"
import { ColorThemePicker, ThemePicker } from "./ThemePicker.tsx"

export function GeneralSettings() {
  return (
    <SettingsFrame id="settings-general" title="General">
      <SettingsPane>
        <SettingsGroup title="Appearance">
          <SettingsRows>
            <AppearanceSettings />
          </SettingsRows>
        </SettingsGroup>
      </SettingsPane>
    </SettingsFrame>
  )
}

function AppearanceSettings() {
  const [choice, choose] = useThemeChoice()
  const [colorThemeId, chooseColorTheme] = useColorTheme()
  const themeLabel = useId()
  const colorThemeLabel = useId()

  return (
    <>
      <SettingsRow label="Color scheme" labelId={themeLabel} stacked>
        <ThemePicker
          labelledBy={themeLabel}
          value={choice}
          colorThemeId={colorThemeId}
          onChange={choose}
        />
      </SettingsRow>
      <SettingsRow label="Theme" labelId={colorThemeLabel} stacked>
        <ColorThemePicker
          labelledBy={colorThemeLabel}
          value={colorThemeId}
          onChange={chooseColorTheme}
        />
      </SettingsRow>
    </>
  )
}
