export interface ShortcutKey {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

export const isMac = (): boolean =>
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform)

export const modPressed = (event: ShortcutKey, mac: boolean): boolean =>
  mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey

export const modKey = (): string => (isMac() ? "⌘" : "Ctrl")

export const modShortcut = (keys: string): string =>
  isMac() ? `⌘${keys.replace("Shift+", "⇧")}` : `Ctrl+${keys}`

export const controlShortcut = (shortcut: string): string =>
  isMac() ? shortcut.replace("Ctrl+Shift+", "⌃⇧").replace("Ctrl+", "⌃") : shortcut

export const insideTerminal = (target: EventTarget | null): boolean =>
  typeof Element !== "undefined" &&
  target instanceof Element &&
  target.closest(".xterm, [data-terminal-dock]") !== null
