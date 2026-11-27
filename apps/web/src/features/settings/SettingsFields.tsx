import { type ReactNode, useId } from "react"
import { CommitInput } from "@/components/CommitInput"
import { NumberInput } from "@/components/ui/number-input"
import { Switch } from "@/components/ui/switch"
import { SettingsRow } from "./SettingsLayout.tsx"

export function SwitchSetting({
  label,
  detail,
  checked,
  onCheckedChange,
  disabled,
  before,
}: {
  readonly label: string
  readonly detail?: ReactNode
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
  readonly disabled?: boolean
  readonly before?: ReactNode
}) {
  const labelId = useId()
  const control = (
    <Switch
      aria-labelledby={labelId}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    />
  )
  return (
    <SettingsRow label={label} labelId={labelId} detail={detail}>
      {before === undefined ? (
        control
      ) : (
        <div className="flex items-center gap-2">
          {before}
          {control}
        </div>
      )}
    </SettingsRow>
  )
}

export function NumberSetting({
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
      <NumberInput
        aria-labelledby={labelId}
        className="w-36"
        value={value}
        min={bounds.min}
        max={bounds.max}
        step={step}
        onChange={onChange}
      />
    </SettingsRow>
  )
}

export function FontFamilySetting({
  detail,
  value,
  onChange,
}: {
  readonly detail: string
  readonly value: string | null
  readonly onChange: (fontFamily: string | null) => void
}) {
  const labelId = useId()
  return (
    <SettingsRow label="Font" labelId={labelId} detail={detail}>
      <CommitInput
        aria-labelledby={labelId}
        className="w-56"
        placeholder="JetBrains Mono"
        value={value ?? ""}
        onCommit={(next) => {
          if (next !== (value ?? "")) onChange(next === "" ? null : next)
        }}
      />
    </SettingsRow>
  )
}
