import { Plus } from "lucide-react"
import { type ReactNode, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AddAccountForm } from "./AddAccount.tsx"
import { useProviderAccounts } from "./providerAccounts.ts"
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "./ProviderIcon.tsx"

/**
 * Adds another account to any provider: one button, and the dialog asks which
 * provider first. Where the provider is already known, `AddAccount` is the one.
 */
export function AddProviderAccount({
  initial = PROVIDER_IDS[0] ?? "claude-code",
}: {
  /** The provider the dialog opens on. */
  readonly initial?: ProviderId
}) {
  const pickerId = useId()
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState(initial)

  const picker = (
    <Field className="gap-2">
      <FieldLabel htmlFor={pickerId}>Provider</FieldLabel>
      <Select
        value={provider}
        onValueChange={(value) => setProvider(PROVIDER_IDS.find((id) => id === value) ?? provider)}
      >
        <SelectTrigger id={pickerId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        {/* Below the field and as wide as it, not laid over it at the list's own width. */}
        <SelectContent position="popper" align="start">
          {PROVIDER_IDS.map((id) => {
            const { name, Icon } = PROVIDERS[id]
            return (
              <SelectItem key={id} value={id}>
                <Icon aria-hidden="true" />
                {name}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          Add account
        </Button>
      </DialogTrigger>
      <DialogContent>
        {/* Keyed: each provider has its own way of adding, and its own form. */}
        <FormFor
          key={provider}
          provider={provider}
          picker={picker}
          onAdded={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function FormFor({
  provider,
  picker,
  onAdded,
}: {
  readonly provider: ProviderId
  readonly picker: ReactNode
  readonly onAdded: () => void
}) {
  const { add } = useProviderAccounts(provider)
  return <AddAccountForm provider={provider} onAdd={add} onAdded={onAdded} picker={picker} />
}
