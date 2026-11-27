import { type Autonomy, DEFAULT_AUTONOMY, type PinnedEffort } from "@humanity/contracts"
import { useId } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePinnedDefaults } from "@/features/home/pinnedDefaults"
import { AUTONOMY_OPTIONS } from "@/features/policy/AutonomyPicker"
import { EFFORT_OPTIONS } from "@/features/providers/effort"
import { modKey } from "@/lib/shortcuts"
import { type SendKey, useUiPreferences } from "@/lib/uiPreferences"
import { ModelDefaultSelect } from "./ModelDefaultSelect.tsx"
import {
  SettingsChoice,
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"
import { SwitchSetting } from "./SettingsFields.tsx"

const LAST = "last"

const autonomyLabel = (value: Autonomy) =>
  AUTONOMY_OPTIONS.find((option) => option.value === value)?.label ?? value

export function ChatSettings() {
  return (
    <SettingsFrame id="settings-chat" title="Chat">
      <SettingsPane>
        <SettingsGroup title="New threads">
          <NewThreadDefaults />
        </SettingsGroup>
        <SettingsGroup title="Composer">
          <ComposerSettings />
        </SettingsGroup>
        <SettingsGroup title="Display">
          <DisplaySettings />
        </SettingsGroup>
      </SettingsPane>
    </SettingsFrame>
  )
}

function NewThreadDefaults() {
  const { pinned, ready, set, error } = usePinnedDefaults()
  const modelId = useId()
  const effortId = useId()
  const autonomyId = useId()

  return (
    <div className="flex flex-col gap-4">
      <SettingsRows>
        <SettingsRow
          label="Model"
          labelId={modelId}
          detail="The model a new thread starts on. A project's own default, under Projects, comes first."
        >
          <ModelDefaultSelect
            value={pinned.model}
            onChange={(model) => void set({ ...pinned, model })}
            noneLabel="The last thread's"
            labelledBy={modelId}
            disabled={!ready}
          />
        </SettingsRow>
        <SettingsRow label="Reasoning effort" labelId={effortId}>
          <Select
            value={pinned.effort ?? LAST}
            onValueChange={(value) =>
              void set({ ...pinned, effort: value === LAST ? null : (value as PinnedEffort) })
            }
            disabled={!ready}
          >
            <SelectTrigger className="w-64" aria-labelledby={effortId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LAST}>The last thread's</SelectItem>
              {EFFORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow
          label="Permissions"
          labelId={autonomyId}
          detail="A project's own default, under Projects, comes first. A thread's mode can change while it runs."
        >
          <Select
            value={pinned.autonomy ?? LAST}
            onValueChange={(value) =>
              void set({
                ...pinned,
                autonomy: AUTONOMY_OPTIONS.find((option) => option.value === value)?.value ?? null,
              })
            }
            disabled={!ready}
          >
            <SelectTrigger className="w-64" aria-labelledby={autonomyId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LAST}>{autonomyLabel(DEFAULT_AUTONOMY)} (default)</SelectItem>
              {AUTONOMY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <option.icon />
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsRows>
      {error !== undefined && <ErrorNote title="The default was not saved" message={error} />}
    </div>
  )
}

function ComposerSettings() {
  const [preferences, change] = useUiPreferences()
  const sendId = useId()
  const mod = modKey()
  const options: ReadonlyArray<{ readonly value: SendKey; readonly label: string }> = [
    { value: "enter", label: "Enter" },
    { value: "mod-enter", label: `${mod}+Enter` },
  ]
  return (
    <SettingsRows>
      <SettingsRow
        label="Send with"
        labelId={sendId}
        detail={
          preferences.sendKey === "enter"
            ? "Shift+Enter starts a new line."
            : "Enter starts a new line."
        }
      >
        <SettingsChoice
          labelledBy={sendId}
          options={options}
          value={preferences.sendKey}
          onChange={(sendKey) => change({ sendKey })}
        />
      </SettingsRow>
    </SettingsRows>
  )
}

function DisplaySettings() {
  const [preferences, change] = useUiPreferences()
  return (
    <SettingsRows>
      <SwitchSetting
        label="Show thinking expanded"
        detail="Open the agent's thoughts in the chat instead of folding them."
        checked={preferences.expandThinking}
        onCheckedChange={(expandThinking) => change({ expandThinking })}
      />
      <SwitchSetting
        label="Show tool calls expanded"
        detail="Open each tool call's details in the chat instead of its one-line summary."
        checked={preferences.expandToolCalls}
        onCheckedChange={(expandToolCalls) => change({ expandToolCalls })}
      />
    </SettingsRows>
  )
}
