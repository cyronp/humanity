import {
  DEFAULT_EDITOR_PREFERENCES,
  type EditorPreferences,
  type FileVersion,
  type OpenedFile,
  type SavedFile,
} from "@humanity/contracts"
import type { EditorState, Extension, Text, TransactionSpec } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import { Cause, Exit, Predicate } from "effect"
import { describeCause } from "@/lib/errors"
import {
  createEditorState,
  languageSlot,
  loadLanguage,
  readOnlyExtension,
  readOnlySlot,
  settingsExtension,
  settingsSlot,
} from "./editorSetup.ts"
import { type DetectedIndent, detectIndent } from "./indent.ts"
import { closeTab, NO_TABS, onDiskChange, openTab, type Tabs } from "./tabs.ts"

export interface FileCalls {
  readonly read: (path: string) => Promise<Exit.Exit<OpenedFile, unknown>>
  readonly versions: (
    paths: ReadonlyArray<string>,
  ) => Promise<Exit.Exit<ReadonlyArray<FileVersion>, unknown>>
  readonly write: (request: {
    readonly path: string
    readonly content: string
    readonly bom: boolean
    readonly baseVersion: string | null
    readonly overwrite: boolean
  }) => Promise<Exit.Exit<SavedFile, unknown>>
}

export interface Conflict {
  readonly version: string | null
}

export type DocView =
  | { readonly kind: "loading" }
  | { readonly kind: "text"; readonly dirty: boolean; readonly saving: boolean }
  | { readonly kind: "binary"; readonly size: number }
  | { readonly kind: "tooLarge"; readonly size: number }
  | { readonly kind: "missing" }
  | { readonly kind: "error"; readonly message: string }

export interface DocSnapshot {
  readonly path: string
  readonly view: DocView
  readonly conflict: Conflict | undefined
  readonly saveError: string | undefined
}

export interface WorkspaceSnapshot {
  readonly tabs: Tabs
  readonly docs: ReadonlyMap<string, DocSnapshot>
  readonly expanded: ReadonlyArray<string>
  readonly revision: number
}

interface TextDoc {
  state: EditorState
  saved: Text
  version: string | null
  bom: boolean
  saving: boolean
  acknowledged: string | null | undefined
  indent: DetectedIndent | undefined
}

interface Doc {
  snapshot: DocSnapshot
  text: TextDoc | undefined
}

const tagOf = (exit: Exit.Exit<unknown, unknown>) => {
  if (!Exit.isFailure(exit)) return undefined
  const error = Cause.squash(exit.cause)
  return Predicate.hasProperty(error, "_tag") && Predicate.isString(error._tag)
    ? { tag: error._tag, error }
    : undefined
}

export class FileWorkspace {
  private tabs: Tabs = NO_TABS
  private expanded: ReadonlyArray<string> = []
  private readonly docs = new Map<string, Doc>()
  private readonly listeners = new Set<() => void>()
  private revision = 0
  private snapshot: WorkspaceSnapshot = {
    tabs: NO_TABS,
    docs: new Map(),
    expanded: [],
    revision: 0,
  }
  private view: EditorView | null = null
  private shown: string | null = null
  private calls: FileCalls | undefined
  private readOnly = false
  private polling = false
  private focusPending: string | null = null
  private preferences: EditorPreferences = DEFAULT_EDITOR_PREFERENCES
  private readonly autoSaves = new Map<string, number>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  connect(calls: FileCalls, readOnly: boolean, preferences: EditorPreferences) {
    this.calls = calls
    if (this.readOnly !== readOnly) {
      this.readOnly = readOnly
      for (const [path] of this.docs) {
        this.transact(path, { effects: readOnlySlot.reconfigure(readOnlyExtension(readOnly)) })
      }
    }
    if (JSON.stringify(this.preferences) !== JSON.stringify(preferences)) {
      this.preferences = preferences
      if (preferences.autoSave !== "afterDelay") this.cancelAutoSaves()
      for (const [path, doc] of this.docs) {
        if (doc.text === undefined) continue
        this.transact(path, {
          effects: settingsSlot.reconfigure(settingsExtension(preferences, doc.text.indent)),
        })
      }
    }
  }

  get dirty(): boolean {
    for (const doc of this.docs.values()) {
      if (doc.snapshot.view.kind === "text" && doc.snapshot.view.dirty) return true
    }
    return false
  }

  isDirty(path: string): boolean {
    const view = this.docs.get(path)?.snapshot.view
    return view?.kind === "text" && view.dirty
  }

  setExpanded(expanded: ReadonlyArray<string>) {
    this.expanded = expanded
    this.emit()
  }

  expand(paths: ReadonlyArray<string>) {
    const missing = paths.filter((path) => !this.expanded.includes(path))
    if (missing.length > 0) this.setExpanded([...this.expanded, ...missing])
  }

  open(path: string, options: { readonly focus?: boolean } = {}) {
    if (options.focus === true) this.focusPending = path
    if (options.focus === true && this.shown === path) {
      this.focusPending = null
      window.setTimeout(() => this.view?.focus())
    }
    this.tabs = openTab(this.tabs, path)
    if (!this.docs.has(path)) {
      this.docs.set(path, { snapshot: this.fresh(path, { kind: "loading" }), text: undefined })
      void this.load(path)
    }
    this.emit()
  }

  activate(path: string) {
    this.tabs = { ...this.tabs, active: path }
    this.emit()
  }

  close(path: string) {
    this.cancelAutoSave(path)
    this.tabs = closeTab(this.tabs, path)
    this.docs.delete(path)
    if (this.shown === path) this.shown = null
    this.emit()
  }

  attach(view: EditorView | null) {
    if (view === null) this.stash()
    this.view = view
    this.shown = null
  }

  show(path: string | null) {
    const view = this.view
    if (view === null) return
    this.stash()
    const text = path === null ? undefined : this.docs.get(path)?.text
    if (path === null || text === undefined) {
      this.shown = null
      return
    }
    if (this.shown !== path) view.setState(text.state)
    this.shown = path
    if (this.focusPending === path) {
      this.focusPending = null
      view.focus()
    }
  }

  contentOf(path: string): string | undefined {
    return this.stateOf(path)?.sliceDoc()
  }

  referenceOf(path: string): string {
    const state = this.stateOf(path)
    if (state === undefined || state.selection.main.empty) return path
    const { from, to } = state.selection.main
    const first = state.doc.lineAt(from).number
    const last = state.doc.lineAt(to === from ? to : to - 1).number
    return first === last ? `${path}:${first}` : `${path}:${first}-${last}`
  }

  async save(path: string, overwrite = false) {
    const doc = this.docs.get(path)
    const calls = this.calls
    const state = this.stateOf(path)
    if (doc?.text === undefined || calls === undefined || state === undefined) return
    if (doc.text.saving || this.readOnly) return
    doc.text.saving = true
    this.refresh(path, { saveError: undefined })
    const exit = await calls.write({
      path,
      content: state.sliceDoc(),
      bom: doc.text.bom,
      baseVersion: doc.text.version,
      overwrite,
    })
    const current = this.docs.get(path)
    if (current?.text === undefined) return
    current.text.saving = false
    if (Exit.isSuccess(exit)) {
      current.text.saved = state.doc
      current.text.version = exit.value.version
      current.text.acknowledged = undefined
      this.revision++
      this.refresh(path, { conflict: undefined })
      return
    }
    const failure = tagOf(exit)
    if (failure?.tag === "FileChangedOnDisk") {
      const version =
        Predicate.hasProperty(failure.error, "version") && Predicate.isString(failure.error.version)
          ? failure.error.version
          : null
      current.text.acknowledged = version
      this.refresh(path, { conflict: { version } })
      return
    }
    this.refresh(path, {
      saveError: describeCause(Exit.isFailure(exit) ? exit.cause : Cause.empty),
    })
  }

  keepMine(path: string) {
    return this.save(path, true)
  }

  async takeDisk(path: string) {
    const calls = this.calls
    const doc = this.docs.get(path)
    if (calls === undefined || doc === undefined) return
    const exit = await calls.read(path)
    if (Exit.isSuccess(exit) && exit.value._tag === "Text") {
      this.replace(path, exit.value)
      this.refresh(path, { conflict: undefined, saveError: undefined })
      return
    }
    if (tagOf(exit)?.tag === "FileNotFound") {
      this.close(path)
      return
    }
    this.refresh(path, {
      saveError: Exit.isFailure(exit) ? describeCause(exit.cause) : "The file is no longer text.",
    })
  }

  async readDisk(path: string): Promise<string | null> {
    const exit = await this.calls?.read(path)
    if (exit === undefined) return null
    if (Exit.isSuccess(exit)) return exit.value._tag === "Text" ? exit.value.content : null
    return tagOf(exit)?.tag === "FileNotFound" ? "" : null
  }

  async poll() {
    const calls = this.calls
    if (calls === undefined || this.polling) return
    const watched = [...this.docs.entries()].filter(([, doc]) => doc.text !== undefined)
    if (watched.length === 0) return
    this.polling = true
    try {
      const exit = await calls.versions(watched.map(([path]) => path))
      if (!Exit.isSuccess(exit)) return
      for (const { path, version } of exit.value) {
        const text = this.docs.get(path)?.text
        if (text === undefined || text.saving) continue
        const change = onDiskChange({
          opened: text.version,
          onDisk: version,
          dirty: this.isDirty(path),
          acknowledged: text.acknowledged,
        })
        if (change === "conflict") {
          text.acknowledged = version
          this.revision++
          this.refresh(path, { conflict: { version } })
        } else if (change === "reload") {
          await this.reloadClean(path)
        }
      }
    } finally {
      this.polling = false
    }
  }

  private async reloadClean(path: string) {
    const exit = await this.calls?.read(path)
    if (exit === undefined || !Exit.isSuccess(exit) || exit.value._tag !== "Text") return
    if (this.isDirty(path)) return
    this.replace(path, exit.value)
  }

  private replace(path: string, file: Extract<OpenedFile, { _tag: "Text" }>) {
    const doc = this.docs.get(path)
    const state = this.stateOf(path)
    if (doc?.text === undefined || state === undefined) return
    const content = file.content
    const head = Math.min(state.selection.main.head, content.length)
    this.transact(path, {
      changes: { from: 0, to: state.doc.length, insert: content },
      selection: { anchor: head },
    })
    const next = this.stateOf(path)
    if (next === undefined) return
    doc.text.saved = next.doc
    doc.text.version = file.version
    doc.text.bom = file.bom
    doc.text.acknowledged = undefined
    this.revision++
    this.markDirty(path, next)
    this.emit()
  }

  private async load(path: string) {
    const calls = this.calls
    if (calls === undefined) return
    const exit = await calls.read(path)
    const doc = this.docs.get(path)
    if (doc === undefined) return
    if (Exit.isFailure(exit)) {
      doc.snapshot =
        tagOf(exit)?.tag === "FileNotFound"
          ? this.fresh(path, { kind: "missing" })
          : this.fresh(path, { kind: "error", message: describeCause(exit.cause) })
      this.emit()
      return
    }
    const file = exit.value
    if (file._tag === "Binary") doc.snapshot = this.fresh(path, { kind: "binary", size: file.size })
    else if (file._tag === "TooLarge") {
      doc.snapshot = this.fresh(path, { kind: "tooLarge", size: file.size })
    } else {
      const indent = detectIndent(file.content)
      const state = createEditorState(
        file.content,
        {
          onSave: () => void this.save(path),
          onChange: (next) => {
            this.markDirty(path, next)
            this.scheduleAutoSave(path)
          },
          onBlur: () => {
            if (this.preferences.autoSave === "onFocusChange") void this.autoSave(path)
          },
        },
        { readOnly: this.readOnly, settings: settingsExtension(this.preferences, indent) },
      )
      doc.text = {
        state,
        saved: state.doc,
        version: file.version,
        bom: file.bom,
        saving: false,
        acknowledged: undefined,
        indent,
      }
      doc.snapshot = this.fresh(path, { kind: "text", dirty: false, saving: false })
      void loadLanguage(path).then((language) => {
        if (language !== undefined) this.setLanguage(path, language)
      })
    }
    this.emit()
  }

  private scheduleAutoSave(path: string) {
    if (this.preferences.autoSave !== "afterDelay") return
    this.cancelAutoSave(path)
    this.autoSaves.set(
      path,
      window.setTimeout(() => {
        this.autoSaves.delete(path)
        void this.autoSave(path)
      }, this.preferences.autoSaveDelay),
    )
  }

  private cancelAutoSave(path: string) {
    const timer = this.autoSaves.get(path)
    if (timer === undefined) return
    window.clearTimeout(timer)
    this.autoSaves.delete(path)
  }

  private cancelAutoSaves() {
    for (const path of [...this.autoSaves.keys()]) this.cancelAutoSave(path)
  }

  private async autoSave(path: string) {
    const doc = this.docs.get(path)
    if (doc === undefined || doc.snapshot.conflict !== undefined || !this.isDirty(path)) return
    if (doc.text?.saving === true) {
      this.scheduleAutoSave(path)
      return
    }
    await this.save(path)
  }

  private setLanguage(path: string, language: Extension) {
    this.transact(path, { effects: languageSlot.reconfigure(language) })
  }

  private transact(path: string, spec: TransactionSpec) {
    const text = this.docs.get(path)?.text
    if (text === undefined) return
    if (this.shown === path && this.view !== null) {
      this.view.dispatch(spec)
      return
    }
    text.state = text.state.update(spec).state
  }

  private stateOf(path: string): EditorState | undefined {
    if (this.shown === path && this.view !== null) return this.view.state
    return this.docs.get(path)?.text?.state
  }

  private stash() {
    if (this.shown === null || this.view === null) return
    const text = this.docs.get(this.shown)?.text
    if (text !== undefined) text.state = this.view.state
  }

  private markDirty(path: string, state: EditorState) {
    const doc = this.docs.get(path)
    if (doc?.text === undefined) return
    const dirty = !state.doc.eq(doc.text.saved)
    const view = doc.snapshot.view
    if (view.kind === "text" && view.dirty === dirty && view.saving === doc.text.saving) return
    doc.snapshot = {
      ...doc.snapshot,
      view: { kind: "text", dirty, saving: doc.text.saving },
    }
    this.emit()
  }

  private refresh(path: string, patch: Partial<Pick<DocSnapshot, "conflict" | "saveError">>) {
    const doc = this.docs.get(path)
    if (doc === undefined) return
    const view: DocView =
      doc.text === undefined
        ? doc.snapshot.view
        : {
            kind: "text",
            dirty: !(this.stateOf(path)?.doc.eq(doc.text.saved) ?? true),
            saving: doc.text.saving,
          }
    doc.snapshot = { ...doc.snapshot, ...patch, view }
    this.emit()
  }

  private fresh(path: string, view: DocView): DocSnapshot {
    return { path, view, conflict: undefined, saveError: undefined }
  }

  private emit() {
    this.snapshot = {
      tabs: this.tabs,
      expanded: this.expanded,
      revision: this.revision,
      docs: new Map([...this.docs].map(([path, doc]) => [path, doc.snapshot])),
    }
    for (const listener of this.listeners) listener()
  }
}

const workspaces = new Map<string, FileWorkspace>()

export const workspaceFor = (sessionId: string): FileWorkspace => {
  let workspace = workspaces.get(sessionId)
  if (workspace === undefined) {
    workspace = new FileWorkspace()
    workspaces.set(sessionId, workspace)
  }
  return workspace
}

export const anyUnsaved = (): boolean => [...workspaces.values()].some((each) => each.dirty)
