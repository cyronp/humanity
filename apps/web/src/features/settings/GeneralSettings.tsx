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
      <SettingsRow label="Theme" labelId={themeLabel} stacked>
        <ThemePicker
          labelledBy={themeLabel}
          value={choice}
          colorThemeId={colorThemeId}
          onChange={choose}
        />
      </SettingsRow>
      <SettingsRow
        label="Color theme"
        labelId={colorThemeLabel}
        detail="Each color theme has a light and a dark version, picked by Theme above."
        stacked
      >
        <ColorThemePicker
          labelledBy={colorThemeLabel}
          value={colorThemeId}
          choice={choice}
          onChange={chooseColorTheme}
        />
      </SettingsRow>
    </>
  )
}
