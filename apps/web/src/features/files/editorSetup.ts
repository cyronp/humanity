import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  LanguageDescription,
  syntaxHighlighting,
} from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { Compartment, EditorState, type Extension, type TransactionSpec } from "@codemirror/state"
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view"
import { tags } from "@lezer/highlight"
import type { EditorPreferences } from "@humanity/contracts"
import type { DetectedIndent } from "./indent.ts"
import { lineBreakOf } from "./tabs.ts"
import { nameOf } from "./tree.ts"

const color = (name: string) => `var(--syntax-${name})`

const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword],
    color: color("keyword"),
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: color("string") },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: color("constant") },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: color("comment"),
    fontStyle: "italic",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: color("function"),
  },
  { tag: [tags.typeName, tags.className, tags.namespace], color: color("type") },
  { tag: [tags.propertyName, tags.attributeName], color: color("property") },
  { tag: [tags.tagName, tags.angleBracket], color: color("tag") },
  {
    tag: [tags.definition(tags.variableName), tags.local(tags.variableName)],
    color: color("variable"),
  },
  { tag: [tags.meta, tags.processingInstruction], color: color("comment") },
  { tag: tags.heading, color: color("keyword"), fontWeight: "600" },
  { tag: tags.link, color: color("string"), textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.invalid, color: color("invalid") },
])

const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { lineHeight: "1.55" },
  ".cm-content": { caretColor: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)" },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--primary) 18%, transparent)",
    outline: "none",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--muted)",
    border: "none",
    color: "var(--muted-foreground)",
  },
  ".cm-panels": { backgroundColor: "var(--popover)", color: "var(--popover-foreground)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-textfield": {
    backgroundColor: "var(--background)",
    border: "1px solid var(--input)",
    borderRadius: "0.375rem",
    color: "var(--foreground)",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--secondary)",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
    color: "var(--secondary-foreground)",
  },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklab, var(--warning) 30%, transparent)" },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklab, var(--warning) 55%, transparent)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
})

export interface EditorHooks {
  readonly onSave: () => void
  readonly onChange: (state: EditorState) => void
  readonly onBlur: () => void
}

export const languageSlot = new Compartment()
export const readOnlySlot = new Compartment()
export const settingsSlot = new Compartment()

const setup: Extension = [
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
  ]),
]

const fontStack = (family: string | null) =>
  family === null ? "var(--font-mono)" : `${JSON.stringify(family)}, var(--font-mono)`

export const settingsExtension = (
  preferences: EditorPreferences,
  detected: DetectedIndent | undefined,
): Extension => {
  const indent: DetectedIndent =
    preferences.detectIndentation && detected !== undefined
      ? detected
      : preferences.insertSpaces
        ? { kind: "spaces", size: preferences.tabSize }
        : { kind: "tabs" }
  return [
    preferences.lineNumbers ? lineNumbers() : [],
    preferences.wordWrap ? EditorView.lineWrapping : [],
    EditorState.tabSize.of(indent.kind === "spaces" ? indent.size : preferences.tabSize),
    indentUnit.of(indent.kind === "spaces" ? " ".repeat(indent.size) : "\t"),
    EditorView.theme({
      ".cm-scroller": {
        fontFamily: fontStack(preferences.fontFamily),
        fontSize: `${preferences.fontSize}px`,
      },
    }),
  ]
}

export const createEditorState = (
  content: string,
  hooks: EditorHooks,
  options: { readonly readOnly: boolean; readonly settings: Extension },
): EditorState =>
  EditorState.create({
    doc: content,
    extensions: [
      lineBreakOf(content) === "\r\n" ? EditorState.lineSeparator.of("\r\n") : [],
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            hooks.onSave()
            return true
          },
        },
        indentWithTab,
      ]),
      setup,
      theme,
      syntaxHighlighting(highlight),
      languageSlot.of([]),
      readOnlySlot.of(readOnlyExtension(options.readOnly)),
      settingsSlot.of(options.settings),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) hooks.onChange(update.state)
      }),
      EditorView.domEventHandlers({
        blur: () => {
          hooks.onBlur()
          return false
        },
      }),
    ],
  })

export const readOnlyExtension = (readOnly: boolean): Extension =>
  readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []

export const loadLanguage = async (path: string): Promise<Extension | undefined> => {
  const description = LanguageDescription.matchFilename(languages, nameOf(path))
  if (description === null) return undefined
  try {
    return await description.load()
  } catch {
    return undefined
  }
}

export const revealSpec = (
  state: EditorState,
  line: number,
  column: number,
  length: number,
): TransactionSpec => {
  const target = state.doc.line(Math.max(1, Math.min(line, state.doc.lines)))
  const from = Math.min(target.from + Math.max(0, column - 1), target.to)
  const to = Math.min(from + Math.max(0, length), target.to)
  return {
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(from, { y: "center" }),
  }
}
