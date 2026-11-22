import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AgentCli } from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Check, CircleHelp, Copy, ExternalLink, FolderOpen } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { openOnboarding } from "@/features/onboarding/onboarding"
import { agentCliAtom } from "@/features/providers/cli"
import { diagnosticsText } from "@/features/system/diagnostics"
import { openFolderAtom, systemInfoAtom } from "@/features/system/atoms"
import { describeCause } from "@/lib/errors"
import { APP_VERSION, DOCS_URL, NEW_ISSUE_URL } from "@/lib/version"
import { closeSettings } from "./settings.ts"
import {
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"

const valueOf = <A,>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined =>
  AsyncResult.isSuccess(result) ? result.value : undefined

export function AboutSettings() {
  const info = valueOf(useAtomValue(systemInfoAtom))
  const openFolder = useAtomSet(openFolderAtom, { mode: "promiseExit" })
  const clis = [
    valueOf(useAtomValue(agentCliAtom("claude-code"))),
    valueOf(useAtomValue(agentCliAtom("codex"))),
    valueOf(useAtomValue(agentCliAtom("kiro"))),
    valueOf(useAtomValue(agentCliAtom("antigravity"))),
  ].filter((cli): cli is AgentCli => cli !== undefined)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string>()

  const showOnboarding = () => {
    closeSettings()
    openOnboarding()
  }

  const openData = async () => {
    setError(undefined)
    const exit = await openFolder({ payload: { folder: "data" } })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  const copyDiagnostics = async () => {
    setError(undefined)
    try {
      await navigator.clipboard.writeText(
        diagnosticsText({ appVersion: APP_VERSION, info, clis, userAgent: navigator.userAgent }),
      )
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <SettingsFrame id="settings-about" title="About">
      <SettingsPane>
        <SettingsGroup>
          <SettingsRows>
            <SettingsRow label="Version">
              <span className="font-mono text-sm">{APP_VERSION ?? "unknown"}</span>
            </SettingsRow>
            <SettingsRow
              label="Data folder"
              detail={
                info === undefined ? undefined : (
                  <code className="font-mono break-all">{info.dataDir}</code>
                )
              }
            >
              <Button variant="outline" size="sm" onClick={() => void openData()}>
                <FolderOpen />
                Open
              </Button>
            </SettingsRow>
            {info !== undefined && (
              <SettingsRow label="Daemon" detail="Listens on this computer only.">
                <span className="font-mono text-sm">127.0.0.1:{info.port}</span>
              </SettingsRow>
            )}
          </SettingsRows>
        </SettingsGroup>
        <SettingsGroup title="Help">
          <SettingsRows>
            <SettingsRow label="Introduction" detail="The tour shown on the first start.">
              <Button variant="outline" size="sm" onClick={showOnboarding}>
                <CircleHelp />
                Show
              </Button>
            </SettingsRow>
            <SettingsRow label="Documentation">
              <Button variant="outline" size="sm" asChild>
                <a href={DOCS_URL} target="_blank" rel="noreferrer">
                  Open
                  <ExternalLink />
                </a>
              </Button>
            </SettingsRow>
            <SettingsRow
              label="Report an issue"
              detail="Copy the diagnostics first and paste them in the issue. They name your OS and versions, nothing else."
            >
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void copyDiagnostics()}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy diagnostics"}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={NEW_ISSUE_URL} target="_blank" rel="noreferrer">
                    New issue
                    <ExternalLink />
                  </a>
                </Button>
              </div>
            </SettingsRow>
          </SettingsRows>
        </SettingsGroup>
        {error !== undefined && <ErrorNote title="That didn't work" message={error} />}
      </SettingsPane>
    </SettingsFrame>
  )
}
