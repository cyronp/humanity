import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { HUMANITY_TOOL_TOKENS, type ToolsPreferences } from "@humanity/contracts"
import { Exit } from "effect"
import { useId, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Switch } from "@/components/ui/switch"
import { describeCause } from "@/lib/errors"
import { HumanityClient, keys } from "@/lib/rpc"
import { SettingsFrame, SettingsPane, SettingsRow, SettingsRows } from "./SettingsLayout.tsx"

const toolsPreferencesAtom = HumanityClient.query("Preferences.getTools", undefined, {
  reactivityKeys: [keys.preferences],
})

const setToolsPreferencesAtom = HumanityClient.mutation("Preferences.setTools")

function TokenCost({ tool }: { readonly tool: keyof ToolsPreferences }) {
  return (
    <span className="mt-2 block font-medium text-warning">
      Adds about {HUMANITY_TOOL_TOKENS[tool].toLocaleString()} tokens to every thread.
    </span>
  )
}

export function ToolsSettings() {
  const result = useAtomValue(toolsPreferencesAtom)
  return (
    <SettingsFrame
      id="settings-tools"
      title="Tools"
      description="Each tool takes up room in the agent's context. Changes apply to new threads."
    >
      <SettingsPane>
        <AsyncView result={result} errorTitle="Couldn't load the tool settings">
          {(preferences) => <ToolsView preferences={preferences} />}
        </AsyncView>
      </SettingsPane>
    </SettingsFrame>
  )
}

function ToolsView({ preferences }: { readonly preferences: ToolsPreferences }) {
  const save = useAtomSet(setToolsPreferencesAtom, { mode: "promiseExit" })
  const [error, setError] = useState<string>()
  const terminalsId = useId()
  const openThreadId = useId()

  const change = async (patch: Partial<ToolsPreferences>) => {
    setError(undefined)
    const exit = await save({
      payload: { tools: { ...preferences, ...patch } },
      reactivityKeys: [keys.preferences],
    })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsRows>
        <SettingsRow
          label="Terminals"
          labelId={terminalsId}
          detail={
            <>
              The agent reads and types in the terminals under the chat. When it's off, the agent
              can't see them.
              <TokenCost tool="terminals" />
            </>
          }
        >
          <Switch
            aria-labelledby={terminalsId}
            checked={preferences.terminals}
            onCheckedChange={(terminals) => void change({ terminals })}
          />
        </SettingsRow>
        <SettingsRow
          label="Open new threads"
          labelId={openThreadId}
          detail={
            <>
              The agent starts another thread in the same project when you ask it to, on any
              provider.
              <TokenCost tool="openThread" />
            </>
          }
        >
          <Switch
            aria-labelledby={openThreadId}
            checked={preferences.openThread}
            onCheckedChange={(openThread) => void change({ openThread })}
          />
        </SettingsRow>
      </SettingsRows>
      {error !== undefined && <ErrorNote title="Couldn't save the tool settings" message={error} />}
    </div>
  )
}
