import { Trash2 } from "lucide-react"
import { ConfirmRemove } from "@/components/ConfirmRemove"
import { Button } from "@/components/ui/button"
import { PROVIDERS, type ProviderId } from "./ProviderIcon.tsx"

export function RemoveAccount({
  provider,
  account,
  folder,
  onRemove,
}: {
  readonly provider: ProviderId
  readonly account: {
    readonly id: string
    readonly name: string
    readonly linkedFolder: boolean
  }
  readonly folder: string | null
  readonly onRemove: (accountId: string) => Promise<string | undefined>
}) {
  const { name: providerName } = PROVIDERS[provider]
  const label = `Remove account “${account.name}”`
  return (
    <ConfirmRemove
      label={label}
      tooltip="Remove account"
      trigger={
        <Button variant="muted" size="icon-sm" aria-label={label}>
          <Trash2 />
        </Button>
      }
      title={`Remove “${account.name}”?`}
      description={
        <>
          {account.linkedFolder ? (
            <>
              Its folder
              {folder !== null && (
                <>
                  {" "}
                  <code className="break-all">{folder}</code>
                </>
              )}{" "}
              is kept, with its login and conversations.
            </>
          ) : (
            `Its login and the conversations ${providerName} kept for it are deleted from this computer.`
          )}{" "}
          Ended threads stay readable.
        </>
      }
      errorTitle="Could not remove the account"
      confirmLabel="Remove account"
      onConfirm={() => onRemove(account.id)}
    />
  )
}
