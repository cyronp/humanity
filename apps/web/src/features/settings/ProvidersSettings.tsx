import { ProviderSection } from "@/features/providers/accounts/ProviderSection"
import { PROVIDER_IDS, PROVIDERS } from "@/features/providers/ProviderIcon"
import { HistoryImportSetting } from "./HistoryImportSetting.tsx"
import { selectSettingsItem, useSettings } from "./settings.ts"
import { SettingsFrame, type SettingsListItem, SettingsSplit } from "./SettingsLayout.tsx"

const ITEMS: ReadonlyArray<SettingsListItem> = PROVIDER_IDS.map((id) => {
  const { name, Icon } = PROVIDERS[id]
  return { id, label: name, icon: <Icon aria-hidden="true" className="size-7" /> }
})

export function ProvidersSettings() {
  const { items } = useSettings()
  const selected = PROVIDER_IDS.find((id) => id === items.providers) ?? "claude-code"

  return (
    <SettingsFrame id="settings-providers" title="Providers">
      <SettingsSplit
        label="Providers"
        items={ITEMS}
        selected={selected}
        onSelect={(id) => selectSettingsItem("providers", id)}
      >
        <ProviderSection
          key={selected}
          provider={selected}
          options={selected === "claude-code" ? <HistoryImportSetting /> : undefined}
        />
      </SettingsSplit>
    </SettingsFrame>
  )
}
