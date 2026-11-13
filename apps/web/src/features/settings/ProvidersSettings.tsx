import { ProvidersOverview } from "@/features/providers/ProvidersOverview"
import { PROVIDERS, type ProviderId } from "@/features/providers/ProviderIcon"
import { selectSettingsItem, useSettings } from "./settings.ts"
import { SettingsFrame, type SettingsListItem, SettingsSplit } from "./SettingsLayout.tsx"

const PROVIDER_IDS = Object.keys(PROVIDERS) as ReadonlyArray<ProviderId>

const ITEMS: ReadonlyArray<SettingsListItem> = PROVIDER_IDS.map((id) => {
  const { name, Icon } = PROVIDERS[id]
  return { id, label: name, icon: <Icon aria-hidden="true" className="size-7" /> }
})

export function ProvidersSettings() {
  const { items } = useSettings()
  const selected = PROVIDER_IDS.find((id) => id === items.providers) ?? "claude-code"

  return (
    <SettingsFrame
      id="settings-providers"
      title="Providers"
      description="The agents Humanity runs sessions on and the accounts they sign in with. Humanity never reads or stores a login: each provider keeps its own."
    >
      <SettingsSplit
        label="Providers"
        items={ITEMS}
        selected={selected}
        onSelect={(id) => selectSettingsItem("providers", id)}
      >
        {/* Claude Code is the only provider so far; another adds its view here. */}
        <ProvidersOverview />
      </SettingsSplit>
    </SettingsFrame>
  )
}
