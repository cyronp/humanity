import { Volume2 } from "lucide-react"
import { useId, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  notificationPermission,
  playChime,
  requestNotifications,
} from "@/features/notifications/notify"
import { useColorTheme, useThemeChoice } from "@/lib/theme"
import {
  CODE_THEMES,
  type CodeThemeId,
  INTERFACE_SCALES,
  type InterfaceScale,
  type UiPreferences,
  useUiPreferences,
} from "@/lib/uiPreferences"
import { IconButton } from "@/components/IconButton"
import {
  SettingsChoice,
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"
import { CodeThemePreview } from "./CodeThemePreview.tsx"
import { ColorThemePicker, ThemePicker } from "./ThemePicker.tsx"
import { SwitchSetting } from "./SettingsFields.tsx"

export function GeneralSettings() {
  return (
    <SettingsFrame id="settings-general" title="General">
      <SettingsPane>
        <SettingsGroup title="Appearance">
          <SettingsRows>
            <AppearanceSettings />
          </SettingsRows>
        </SettingsGroup>
        <SettingsGroup title="Notifications">
          <NotificationSettings />
        </SettingsGroup>
      </SettingsPane>
    </SettingsFrame>
  )
}

const SCALE_OPTIONS = INTERFACE_SCALES.map((scale) => ({
  value: String(scale) as `${InterfaceScale}`,
  label: `${scale}%`,
}))

function AppearanceSettings() {
  const [choice, choose] = useThemeChoice()
  const [colorThemeId, chooseColorTheme] = useColorTheme()
  const [preferences, change] = useUiPreferences()
  const themeLabel = useId()
  const colorThemeLabel = useId()
  const scaleLabel = useId()
  const codeLabel = useId()

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
      <SettingsRow
        label="Interface size"
        labelId={scaleLabel}
        detail="Scales text and controls across the app. The terminal keeps its own font size."
      >
        <SettingsChoice
          labelledBy={scaleLabel}
          options={SCALE_OPTIONS}
          value={String(preferences.interfaceScale) as `${InterfaceScale}`}
          onChange={(value) => change({ interfaceScale: Number(value) as InterfaceScale })}
        />
      </SettingsRow>
      <SettingsRow
        label="Code theme"
        labelId={codeLabel}
        detail="Colors code in the chat, diffs and tool output, in light and dark."
      >
        <Select
          value={preferences.codeTheme}
          onValueChange={(codeTheme) => change({ codeTheme: codeTheme as CodeThemeId })}
        >
          <SelectTrigger className="w-56" aria-labelledby={codeLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CODE_THEMES) as Array<CodeThemeId>).map((id) => (
              <SelectItem key={id} value={id}>
                {CODE_THEMES[id].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="basis-full">
          <CodeThemePreview />
        </div>
      </SettingsRow>
    </>
  )
}

type NotifyKey = keyof Pick<UiPreferences, "notifyWaiting" | "notifyFinished" | "notifyFailed">

const NOTIFY_ROWS: ReadonlyArray<{
  readonly key: NotifyKey
  readonly label: string
  readonly detail: string
}> = [
  {
    key: "notifyWaiting",
    label: "When a thread waits for you",
    detail: "A change, a command or a question needs your answer.",
  },
  { key: "notifyFinished", label: "When a thread finishes", detail: "The agent ended its turn." },
  { key: "notifyFailed", label: "When a thread stops on an error", detail: "The agent stopped." },
]

const describePermission = (permission: ReturnType<typeof notificationPermission>) =>
  permission === "unsupported"
    ? "This browser can't show notifications, so only the sound plays."
    : permission === "denied"
      ? "Notifications are blocked for Humanity. Allow them in your browser's site settings."
      : undefined

function NotificationSettings() {
  const [preferences, change] = useUiPreferences()
  const [permission, setPermission] = useState(notificationPermission)

  const toggle = async (key: NotifyKey, on: boolean) => {
    change({ [key]: on })
    if (on) setPermission(await requestNotifications())
  }

  const note = describePermission(permission)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Shown when you're looking elsewhere: another app, another tab or another thread.
      </p>
      <SettingsRows>
        {NOTIFY_ROWS.map(({ key, label, detail }) => (
          <SwitchSetting
            key={key}
            label={label}
            detail={detail}
            checked={preferences[key]}
            onCheckedChange={(on) => void toggle(key, on)}
          />
        ))}
        <SwitchSetting
          label="Play a sound"
          detail="A short chime with each notification."
          checked={preferences.notifySound}
          onCheckedChange={(notifySound) => change({ notifySound })}
          before={
            <IconButton variant="ghost" size="icon-sm" onClick={playChime} label="Play the sound">
              <Volume2 />
            </IconButton>
          }
        />
      </SettingsRows>
      {note !== undefined && <p className="text-xs text-warning">{note}</p>}
    </div>
  )
}
