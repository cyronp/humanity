import { ProvidersOverview } from "@/features/providers/ProvidersOverview"

export function ConnectStep() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Connect an account</h2>
        <p className="max-w-prose text-muted-foreground">
          Agent sessions run as the accounts connected here. There is no Humanity account and no key
          to paste: each provider signs in with its own login, and Humanity never reads or stores
          it. Usage counts against the account's plan, the same as in a terminal.
        </p>
      </div>
      <ProvidersOverview />
      <p className="text-xs text-muted-foreground">
        You can change this later in Settings, at the bottom of the sidebar.
      </p>
    </div>
  )
}
