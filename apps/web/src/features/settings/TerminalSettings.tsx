import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  DEFAULT_TERMINAL_PREFERENCES,
  TERMINAL_FONT_SIZES,
  TERMINAL_SCROLLBACK,
  type TerminalPreferences,
} from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { useId } from "react"
import { Input } from "@/components/ui/input"
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
import { keys } from "@/lib/rpc"
import {
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"

const SYSTEM_DEFAULT = "system"

const clamp = (value: number, bounds: { readonly min: number; readonly max: number }) =>
  Math.round(Math.min(Math.max(value, bounds.min), bounds.max))

export function TerminalSettings() {
  const result = useAtomValue(terminalPreferencesAtom)
  const preferences = AsyncResult.isSuccess(result) ? result.value : DEFAULT_TERMINAL_PREFERENCES
  const save = useAtomSet(setTerminalPreferencesAtom, { mode: "promiseExit" })
  const change = (patch: Partial<TerminalPreferences>) =>
    void save({
      payload: { terminal: { ...preferences, ...patch } },
      reactivityKeys: [keys.preferences],
    })

  return (
    <SettingsFrame
      id="settings-terminal"
      title="Terminal"
      description="The terminals under a thread's chat. Changes apply to terminals opened from now on; the font size applies at once."
    >
      <SettingsPane>
        <SettingsGroup>
          <SettingsRows>
            <ShellSetting value={preferences.shell} onChange={(shell) => change({ shell })} />
            <NumberSetting
              label="Font size"
              detail={`In pixels, ${TERMINAL_FONT_SIZES.min} to ${TERMINAL_FONT_SIZES.max}.`}
              value={preferences.fontSize}
              bounds={TERMINAL_FONT_SIZES}
              onChange={(fontSize) => change({ fontSize })}
            />
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

function NumberSetting({
  label,
  detail,
  value,
  bounds,
  step = 1,
  onChange,
}: {
  readonly label: string
  readonly detail: string
  readonly value: number
  readonly bounds: { readonly min: number; readonly max: number }
  readonly step?: number
  readonly onChange: (value: number) => void
}) {
  const labelId = useId()
  return (
    <SettingsRow label={label} labelId={labelId} detail={detail}>
      <Input
        key={value}
        type="number"
        aria-labelledby={labelId}
        className="w-28"
        min={bounds.min}
        max={bounds.max}
        step={step}
        defaultValue={value}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value)
          if (Number.isFinite(next) && event.currentTarget.value !== "") {
            const clamped = clamp(next, bounds)
            if (clamped !== value) onChange(clamped)
            else event.currentTarget.value = String(value)
          } else {
            event.currentTarget.value = String(value)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </SettingsRow>
  )
}
