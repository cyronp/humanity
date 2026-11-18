export type TerminalCommand =
  | "copy"
  | "paste"
  | "select-all"
  | "find"
  | "toggle-dock"
  | "new-terminal"
  | "next-terminal"
  | "previous-terminal"

export interface KeyPress {
  readonly type: string
  readonly key: string
  readonly code: string
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
}

export const terminalCommand = (
  press: KeyPress,
  options: { readonly mac: boolean; readonly hasSelection: boolean },
): TerminalCommand | undefined => {
  const { ctrlKey: ctrl, shiftKey: shift, altKey: alt, metaKey: meta } = press
  const key = press.key.toLowerCase()
  if (press.code === "Backquote" && ctrl && !alt && !meta) {
    return shift ? "new-terminal" : "toggle-dock"
  }
  if (ctrl && !alt && !meta && !shift && press.key === "PageDown") return "next-terminal"
  if (ctrl && !alt && !meta && !shift && press.key === "PageUp") return "previous-terminal"
  if (options.mac) {
    if (!meta || ctrl || alt) return undefined
    if (key === "c" && !shift) return options.hasSelection ? "copy" : undefined
    if (key === "v" && !shift) return "paste"
    if (key === "a" && !shift) return "select-all"
    if (key === "f" && !shift) return "find"
    return undefined
  }
  if (shift && !ctrl && !alt && !meta && press.key === "Insert") return "paste"
  if (!ctrl || alt || meta) return undefined
  if (key === "c") return shift || options.hasSelection ? "copy" : undefined
  if (key === "v") return "paste"
  if (key === "a" && shift) return "select-all"
  if (key === "f") return "find"
  return undefined
}

export const isMac = () => /mac/i.test(navigator.platform)

export const shortcutLabel = (shortcut: string) =>
  isMac() ? shortcut.replace("Ctrl+Shift+", "⌃⇧").replace("Ctrl+", "⌃") : shortcut
