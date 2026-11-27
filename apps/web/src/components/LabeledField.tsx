import type { ReactNode } from "react"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

export function LabeledField({
  label,
  htmlFor,
  hint,
  children,
}: {
  readonly label: string
  readonly htmlFor: string
  readonly hint?: string
  readonly children: ReactNode
}) {
  return (
    <Field className="min-w-0 gap-1.5">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {hint !== undefined && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}
