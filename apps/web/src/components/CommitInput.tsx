import type { ComponentProps } from "react"
import { Input } from "@/components/ui/input"

export function CommitInput({
  value,
  onCommit,
  revertOnEscape = false,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onBlur" | "onKeyDown"> & {
  readonly value: string
  readonly onCommit: (next: string) => boolean | void
  readonly revertOnEscape?: boolean
}) {
  return (
    <Input
      key={value}
      defaultValue={value}
      onBlur={(event) => {
        if (onCommit(event.currentTarget.value.trim()) === false) event.currentTarget.value = value
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape" && revertOnEscape) {
          event.currentTarget.value = value
          event.currentTarget.blur()
        }
      }}
      {...props}
    />
  )
}
