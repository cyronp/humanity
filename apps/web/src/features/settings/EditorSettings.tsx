import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  DEFAULT_EDITOR_PREFERENCES,
  EDITOR_AUTO_SAVE_DELAYS,
  EDITOR_FONT_SIZES,
  EDITOR_TAB_SIZES,
  type EditorAutoSave,
  type EditorPreferences,
} from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { useId } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { editorPreferencesAtom, setEditorPreferencesAtom } from "@/features/files/atoms"
import { keys } from "@/lib/rpc"
import {
  SettingsChoice,
  SettingsFrame,
  SettingsGroup,
  SettingsPane,
  SettingsRow,
  SettingsRows,
} from "./SettingsLayout.tsx"
import { NumberSetting } from "./TerminalSettings.tsx"

const AUTO_SAVE: ReadonlyArray<{ readonly value: EditorAutoSave; readonly label: string }> = [
  { value: "off", label: "Off" },
  { value: "afterDelay", label: "After a delay" },
  { value: "onFocusChange", label: "When focus leaves" },
]

const AUTO_SAVE_DETAIL: Readonly<Record<EditorAutoSave, string>> = {
  off: "Save with Ctrl+S or the Save button.",
  afterDelay: "Saves a file once you stop typing for the delay below.",
  onFocusChange: "Saves a file when you click outside the editor, switch tabs or leave the window.",
}

type Toggle = keyof Pick<
  EditorPreferences,
  "insertSpaces" | "detectIndentation" | "wordWrap" | "lineNumbers" | "fileIcons"
>

const TOGGLES: Readonly<
  Record<
    "text" | "indentation" | "files",
    ReadonlyArray<{ key: Toggle; label: string; detail: string }>
  >
> = {
  text: [
    { key: "wordWrap", label: "Word wrap", detail: "Wraps long lines at the edge of the editor." },
    { key: "lineNumbers", label: "Line numbers", detail: "Shows each line's number beside it." },
  ],
  indentation: [
    {
      key: "detectIndentation",
      label: "Detect indentation",
      detail: "Follows the tabs or spaces a file already uses, before the settings below.",
    },
    {
      key: "insertSpaces",
      label: "Indent with spaces",
      detail: "Tab inserts spaces instead of a tab character.",
    },
  ],
  files: [
    {
      key: "fileIcons",
      label: "File icons",
      detail:
        "Shows an icon for each file's kind (TypeScript, Python, …) in the tree and the tabs.",
    },
  ],
}

export function EditorSettings() {
  const result = useAtomValue(editorPreferencesAtom)
  const preferences = AsyncResult.isSuccess(result) ? result.value : DEFAULT_EDITOR_PREFERENCES
  const save = useAtomSet(setEditorPreferencesAtom, { mode: "promiseExit" })
  const change = (patch: Partial<EditorPreferences>) =>
    void save({
      payload: { editor: { ...preferences, ...patch } },
      reactivityKeys: [keys.preferences],
    })
  const autoSaveId = useId()
  const toggleIds = useId()

  const toggleRow = ({ key, label, detail }: { key: Toggle; label: string; detail: string }) => (
    <SettingsRow key={key} label={label} labelId={`${toggleIds}-${key}`} detail={detail}>
      <Switch
        aria-labelledby={`${toggleIds}-${key}`}
        checked={preferences[key]}
        onCheckedChange={(on) => change({ [key]: on })}
      />
    </SettingsRow>
  )

  return (
    <SettingsFrame
      id="settings-editor"
      title="Editor"
      description="The editor of the Files tool. Changes apply at once to open files."
    >
      <SettingsPane>
        <SettingsGroup title="Saving">
          <SettingsRows>
            <SettingsRow
              label="Auto save"
              labelId={autoSaveId}
              detail={`${AUTO_SAVE_DETAIL[preferences.autoSave]} A file that changed on disk is never saved over without asking.`}
            >
              <SettingsChoice
                labelledBy={autoSaveId}
                options={AUTO_SAVE}
                value={preferences.autoSave}
                onChange={(autoSave) => change({ autoSave })}
              />
            </SettingsRow>
            {preferences.autoSave === "afterDelay" && (
              <NumberSetting
                label="Auto save delay"
                detail={`In milliseconds, ${EDITOR_AUTO_SAVE_DELAYS.min} to ${EDITOR_AUTO_SAVE_DELAYS.max.toLocaleString()}.`}
                value={preferences.autoSaveDelay}
                bounds={EDITOR_AUTO_SAVE_DELAYS}
                step={100}
                onChange={(autoSaveDelay) => change({ autoSaveDelay })}
              />
            )}
          </SettingsRows>
        </SettingsGroup>
        <SettingsGroup title="Text">
          <SettingsRows>
            <FontFamilySetting
              value={preferences.fontFamily}
              onChange={(fontFamily) => change({ fontFamily })}
            />
            <NumberSetting
              label="Font size"
              detail={`In pixels, ${EDITOR_FONT_SIZES.min} to ${EDITOR_FONT_SIZES.max}.`}
              value={preferences.fontSize}
              bounds={EDITOR_FONT_SIZES}
              onChange={(fontSize) => change({ fontSize })}
            />
            {TOGGLES.text.map(toggleRow)}
          </SettingsRows>
        </SettingsGroup>
        <SettingsGroup title="Indentation">
          <SettingsRows>
            {TOGGLES.indentation.map(toggleRow)}
            <NumberSetting
              label="Tab size"
              detail={`Columns a tab or an indent takes, ${EDITOR_TAB_SIZES.min} to ${EDITOR_TAB_SIZES.max}.`}
              value={preferences.tabSize}
              bounds={EDITOR_TAB_SIZES}
              onChange={(tabSize) => change({ tabSize })}
            />
          </SettingsRows>
        </SettingsGroup>
        <SettingsGroup title="Files">
          <SettingsRows>{TOGGLES.files.map(toggleRow)}</SettingsRows>
        </SettingsGroup>
      </SettingsPane>
    </SettingsFrame>
  )
}

function FontFamilySetting({
  value,
  onChange,
}: {
  readonly value: string | null
  readonly onChange: (fontFamily: string | null) => void
}) {
  const labelId = useId()
  return (
    <SettingsRow
      label="Font"
      labelId={labelId}
      detail="A font installed on this machine. Empty uses the app's monospace font."
    >
      <Input
        key={value ?? ""}
        aria-labelledby={labelId}
        className="w-56"
        placeholder="JetBrains Mono"
        defaultValue={value ?? ""}
        onBlur={(event) => {
          const next = event.currentTarget.value.trim()
          if (next !== (value ?? "")) onChange(next === "" ? null : next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </SettingsRow>
  )
}
