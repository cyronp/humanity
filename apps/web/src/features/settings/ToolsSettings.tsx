import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  HUMANITY_TOKENS_PER_SKILL,
  HUMANITY_TOOL_TOKENS,
  type ToolsPreferences,
} from "@humanity/contracts"
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

const TOOL_KEYS = Object.keys(HUMANITY_TOOL_TOKENS) as ReadonlyArray<keyof ToolsPreferences>

function TokenCost({ tool }: { readonly tool: keyof ToolsPreferences }) {
  return (
    <span className="mt-2 block font-medium text-warning">
      {tool === "skills"
        ? `Adds about ${HUMANITY_TOOL_TOKENS.skills.toLocaleString()} tokens, and ${HUMANITY_TOKENS_PER_SKILL} per skill, to every thread that gets one.`
        : `Adds about ${HUMANITY_TOOL_TOKENS[tool].toLocaleString()} tokens to every thread.`}
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
  const skillsId = useId()

  const total = TOOL_KEYS.filter((tool) => preferences[tool]).reduce(
    (sum, tool) => sum + HUMANITY_TOOL_TOKENS[tool],
    0,
  )

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
        <SettingsRow
          label="Skills from your other agents"
          labelId={skillsId}
          detail={
            <>
              Every agent gets the skills it doesn't load itself: Claude Code's for Codex, Codex's
              for Claude Code, and so on, with the repository's and Humanity's own. The agent loads
              one when a task matches it.
              <TokenCost tool="skills" />
            </>
          }
        >
          <Switch
            aria-labelledby={skillsId}
            checked={preferences.skills}
            onCheckedChange={(skills) => void change({ skills })}
          />
        </SettingsRow>
      </SettingsRows>
      <p className="text-sm text-muted-foreground">
        {total === 0
          ? "With every tool off, threads get no Humanity tools at all."
          : `Together, about ${total.toLocaleString()} tokens per thread${preferences.skills ? `, plus ${HUMANITY_TOKENS_PER_SKILL} per skill` : ""}.`}
      </p>
      {error !== undefined && <ErrorNote title="Couldn't save the tool settings" message={error} />}
    </div>
  )
}
