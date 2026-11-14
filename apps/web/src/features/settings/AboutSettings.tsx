import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openOnboarding } from "@/features/onboarding/onboarding"
import { APP_VERSION } from "@/lib/version"
import { closeSettings } from "./settings.ts"
import { SettingsFrame, SettingsPane, SettingsRow, SettingsRows } from "./SettingsLayout.tsx"

/** Which Humanity this is, and the way back to its introduction. */
export function AboutSettings() {
  const showOnboarding = () => {
    closeSettings()
    openOnboarding()
  }

  return (
    <SettingsFrame
      id="settings-about"
      title="About"
      description="Humanity runs coding agents in threads, on their own or asking you first."
    >
      <SettingsPane>
        <SettingsRows>
          <SettingsRow label="Version" detail="The version of Humanity running on this device.">
            <span className="font-mono text-sm">{APP_VERSION ?? "unknown"}</span>
          </SettingsRow>
          <SettingsRow
            label="How Humanity works"
            detail="The introduction shown on the first start."
          >
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
