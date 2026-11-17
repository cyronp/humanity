import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openOnboarding } from "@/features/onboarding/onboarding"
import { APP_VERSION } from "@/lib/version"
import { closeSettings } from "./settings.ts"
import { SettingsFrame, SettingsPane, SettingsRow, SettingsRows } from "./SettingsLayout.tsx"

export function AboutSettings() {
  const showOnboarding = () => {
    closeSettings()
    openOnboarding()
  }

  return (
    <SettingsFrame id="settings-about" title="About">
      <SettingsPane>
        <SettingsRows>
          <SettingsRow label="Version">
            <span className="font-mono text-sm">{APP_VERSION ?? "unknown"}</span>
          </SettingsRow>
          <SettingsRow label="Introduction">
            <Button variant="outline" size="sm" onClick={showOnboarding}>
              <CircleHelp />
              Show
            </Button>
          </SettingsRow>
        </SettingsRows>
      </SettingsPane>
    </SettingsFrame>
  )
}
