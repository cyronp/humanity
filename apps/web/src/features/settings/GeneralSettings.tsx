import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react"
import { useId } from "react"
import { type ThemeChoice, useThemeChoice } from "@/lib/theme"
import {
  SettingsChoice,
  SettingsFrame,
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
    <SettingsFrame
      id="settings-general"
      title="General"
      description="How Humanity looks on this device."
    >
      <SettingsPane>
        <SettingsRows>
          <ThemeSetting />
        </SettingsRows>
      </SettingsPane>
    </SettingsFrame>
  )
}

function ThemeSetting() {
  const [choice, choose] = useThemeChoice()
  const labelId = useId()

  return (
    <SettingsRow
      label="Theme"
      labelId={labelId}
      detail="System follows your operating system's light or dark mode."
    >
      <SettingsChoice labelledBy={labelId} options={THEMES} value={choice} onChange={choose} />
    </SettingsRow>
  )
}
