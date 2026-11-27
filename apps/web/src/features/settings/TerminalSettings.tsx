import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  DEFAULT_TERMINAL_PREFERENCES,
  TERMINAL_FONT_SIZES,
  TERMINAL_LINE_HEIGHTS,
  TERMINAL_SCROLLBACK,
  type TerminalCursorStyle,
  type TerminalPreferences,
} from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { useId } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  setTerminalPreferencesAtom,
  shellsAtom,
  terminalPreferencesAtom,
} from "@/features/terminal/atoms"
import { ShellIcon } from "@/features/terminal/ShellIcon"
import { keys } from "@/lib/rpc"
import {
  SettingsChoice,
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"
import { FontFamilySetting, NumberSetting, SwitchSetting } from "./SettingsFields.tsx"

const SYSTEM_DEFAULT = "system"

const CURSOR_STYLES: ReadonlyArray<{
  readonly value: TerminalCursorStyle
  readonly label: string
}> = [
  { value: "block", label: "Block" },
  { value: "bar", label: "Bar" },
  { value: "underline", label: "Underline" },
]

type Toggle = keyof Pick<
  TerminalPreferences,
  | "cursorBlink"
  | "copyOnSelect"
  | "rightClickPaste"
  | "gpuAcceleration"
  | "shellIntegration"
  | "confirmClose"
>

const BEHAVIOR: ReadonlyArray<{
  readonly key: Toggle
  readonly label: string
  readonly detail: string
}> = [
  {
    key: "copyOnSelect",
    label: "Copy on select",
    detail: "Copies text to the clipboard as soon as you select it.",
  },
  {
    key: "rightClickPaste",
    label: "Right-click to paste",
    detail: "Right-click pastes, or copies a selection. Shift+right-click opens the menu.",
  },
  {
    key: "confirmClose",
    label: "Ask before closing a running terminal",
    detail: "When a command is still running in it.",
  },
]

const ADVANCED: ReadonlyArray<{
  readonly key: Toggle
  readonly label: string
  readonly detail: string
}> = [
  {
    key: "gpuAcceleration",
    label: "GPU rendering",
    detail: "Draws terminals with WebGL. Turn it off if text looks garbled on your graphics card.",
  },
  {
    key: "shellIntegration",
    label: "Shell integration",
    detail:
      "Marks each command's start and end, so tabs show what runs and the agent can wait for a command. Turn it off if it clashes with your shell's own startup files. Applies to new terminals.",
  },
]

export function TerminalSettings() {
  const result = useAtomValue(terminalPreferencesAtom)
  const preferences = AsyncResult.isSuccess(result) ? result.value : DEFAULT_TERMINAL_PREFERENCES
  const save = useAtomSet(setTerminalPreferencesAtom, { mode: "promiseExit" })
  const change = (patch: Partial<TerminalPreferences>) =>
    void save({
      payload: { terminal: { ...preferences, ...patch } },
      reactivityKeys: [keys.preferences],
    })
  const cursorId = useId()

  const toggleRow = ({ key, label, detail }: (typeof BEHAVIOR)[number]) => (
    <SwitchSetting
      key={key}
      label={label}
      detail={detail}
      checked={preferences[key]}
      onCheckedChange={(on) => change({ [key]: on })}
    />
  )

  return (
    <SettingsFrame
      id="settings-terminal"
      title="Terminal"
      description="The shell and scrollback apply to new terminals. How text looks applies at once."
    >
      <SettingsPane>
        <SettingsGroup>
          <SettingsRows>
            <ShellSetting value={preferences.shell} onChange={(shell) => change({ shell })} />
            <NumberSetting
              label="Scrollback"
              detail={`Lines a terminal keeps above its screen, ${TERMINAL_SCROLLBACK.min.toLocaleString()} to ${TERMINAL_SCROLLBACK.max.toLocaleString()}.`}
              value={preferences.scrollback}
              bounds={TERMINAL_SCROLLBACK}
              step={1000}
              onChange={(scrollback) => change({ scrollback })}
            />
          </SettingsRows>
        </SettingsGroup>
        <SettingsGroup title="Text">
          <SettingsRows>
            <FontFamilySetting
              detail="A font installed on this machine. Empty uses a Nerd Font when you have one, else your system's monospace font."
              value={preferences.fontFamily}
              onChange={(fontFamily) => change({ fontFamily })}
            />
            <NumberSetting
              label="Font size"
              detail={`In pixels, ${TERMINAL_FONT_SIZES.min} to ${TERMINAL_FONT_SIZES.max}.`}
              value={preferences.fontSize}
              bounds={TERMINAL_FONT_SIZES}
              onChange={(fontSize) => change({ fontSize })}
            />
            <NumberSetting
              label="Line height"
              detail={`A multiple of the font size, ${TERMINAL_LINE_HEIGHTS.min} to ${TERMINAL_LINE_HEIGHTS.max}.`}
              value={preferences.lineHeight}
              bounds={TERMINAL_LINE_HEIGHTS}
              step={0.1}
              onChange={(lineHeight) => change({ lineHeight })}
            />
            <SettingsRow label="Cursor" labelId={cursorId}>
              <SettingsChoice
                labelledBy={cursorId}
                options={CURSOR_STYLES}
                value={preferences.cursorStyle}
                onChange={(cursorStyle) => change({ cursorStyle })}
              />
            </SettingsRow>
            <SwitchSetting
              label="Blinking cursor"
              checked={preferences.cursorBlink}
              onCheckedChange={(cursorBlink) => change({ cursorBlink })}
            />
          </SettingsRows>
        </SettingsGroup>
        <SettingsGroup title="Behavior">
          <SettingsRows>{BEHAVIOR.map(toggleRow)}</SettingsRows>
        </SettingsGroup>
        <SettingsGroup title="Advanced">
          <SettingsRows>{ADVANCED.map(toggleRow)}</SettingsRows>
        </SettingsGroup>
      </SettingsPane>
    </SettingsFrame>
  )
}

function ShellSetting({
  value,
  onChange,
}: {
  readonly value: string | null
  readonly onChange: (shell: string | null) => void
}) {
  const labelId = useId()
  const result = useAtomValue(shellsAtom)
  const shells = AsyncResult.isSuccess(result) ? result.value : []
  const fallback = shells[0]
  return (
    <SettingsRow
      label="Shell"
      labelId={labelId}
      detail="The shell a new terminal starts. The + menu of the terminals opens any other."
    >
      <Select
        value={value ?? SYSTEM_DEFAULT}
        onValueChange={(next) => onChange(next === SYSTEM_DEFAULT ? null : next)}
      >
        <SelectTrigger className="w-56" aria-labelledby={labelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SYSTEM_DEFAULT}>
            {fallback === undefined ? "System default" : `System default (${fallback.name})`}
          </SelectItem>
          {shells.map((shell) => (
            <SelectItem key={shell.id} value={shell.id} title={shell.path}>
              <ShellIcon shell={shell.id} className="size-4" />
              {shell.name}
            </SelectItem>
          ))}
          {value !== null && !shells.some((shell) => shell.id === value) && (
            <SelectItem value={value} disabled>
              {value} (not found)
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </SettingsRow>
  )
}
