import { ProvidersOverview } from "@/features/providers/ProvidersOverview"

export function ProvidersSettings() {
  return (
    <section aria-labelledby="settings-providers" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="settings-providers" className="text-base font-medium">
          Providers
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          The agents Humanity runs sessions on and the accounts they sign in with. Humanity never
          reads or stores a login: each provider keeps its own.
        </p>
      </div>
      <ProvidersOverview />
    </section>
  )
}
