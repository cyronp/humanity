import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react"
import { useId } from "react"
import { type ThemeChoice, useThemeChoice } from "@/lib/theme"
import {
  SettingsChoice,
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const satisfies ReadonlyArray<{
  readonly value: ThemeChoice
  readonly label: string
  readonly icon: LucideIcon
}>

/** Settings of the app itself, not of a provider or a project. */
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
    <SettingsRow label="Theme" labelId={labelId}>
      <SettingsChoice labelledBy={labelId} options={THEMES} value={choice} onChange={choose} />
    </SettingsRow>
  )
}
