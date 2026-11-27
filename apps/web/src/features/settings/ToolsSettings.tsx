import { useAtomValue } from "@effect/atom-react"
import {
  HUMANITY_TOKENS_PER_SKILL,
  HUMANITY_TOOL_TOKENS,
  type ToolsPreferences,
} from "@humanity/contracts"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { HumanityClient, keys } from "@/lib/rpc"
import { SettingsFrame, SettingsPane, SettingsRows } from "./SettingsLayout.tsx"
import { SwitchSetting } from "./SettingsFields.tsx"
import { useAction } from "@/lib/useAction"

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
  const { run: save, error } = useAction(setToolsPreferencesAtom)

  const total = TOOL_KEYS.filter((tool) => preferences[tool]).reduce(
    (sum, tool) => sum + HUMANITY_TOOL_TOKENS[tool],
    0,
  )

  const change = async (patch: Partial<ToolsPreferences>) => {
    await save({
      payload: { tools: { ...preferences, ...patch } },
      reactivityKeys: [keys.preferences],
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsRows>
        <SwitchSetting
          label="Terminals"
          detail={
            <>
              The agent reads and types in the terminals under the chat. When it's off, the agent
              can't see them.
              <TokenCost tool="terminals" />
            </>
          }
          checked={preferences.terminals}
          onCheckedChange={(terminals) => void change({ terminals })}
        />
        <SwitchSetting
          label="Open new threads"
          detail={
            <>
              The agent starts another thread in the same project when you ask it to, on any
              provider.
              <TokenCost tool="openThread" />
            </>
          }
          checked={preferences.openThread}
          onCheckedChange={(openThread) => void change({ openThread })}
        />
        <SwitchSetting
          label="Skills from your other agents"
          detail={
            <>
              Every agent gets the skills it doesn't load itself: Claude Code's for Codex, Codex's
              for Claude Code, and so on, with the repository's and Humanity's own. The agent loads
              one when a task matches it.
              <TokenCost tool="skills" />
            </>
          }
          checked={preferences.skills}
          onCheckedChange={(skills) => void change({ skills })}
        />
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
