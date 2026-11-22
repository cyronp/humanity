export interface Tabs {
  readonly open: ReadonlyArray<string>
  readonly active: string | null
}

export const NO_TABS: Tabs = { open: [], active: null }

export const openTab = (tabs: Tabs, path: string): Tabs => {
  if (tabs.open.includes(path)) return { ...tabs, active: path }
  const at = tabs.active === null ? -1 : tabs.open.indexOf(tabs.active)
  const open = [...tabs.open]
  open.splice(at === -1 ? open.length : at + 1, 0, path)
  return { open, active: path }
}

export const closeTab = (tabs: Tabs, path: string): Tabs => {
  const at = tabs.open.indexOf(path)
  if (at === -1) return tabs
  const open = tabs.open.filter((each) => each !== path)
  if (tabs.active !== path) return { open, active: tabs.active }
  return { open, active: open[Math.min(at, open.length - 1)] ?? null }
}

export type DiskChange = "none" | "reload" | "conflict"

export const onDiskChange = (options: {
  readonly opened: string | null
  readonly onDisk: string | null
  readonly dirty: boolean
  readonly acknowledged: string | null | undefined
}): DiskChange => {
  if (options.onDisk === options.opened) return "none"
  if (options.dirty || options.onDisk === null) {
    return options.acknowledged === options.onDisk ? "none" : "conflict"
  }
  return "reload"
}

export const lineBreakOf = (content: string): "\r\n" | "\n" => {
  const crlf = content.split("\r\n").length - 1
  if (crlf === 0) return "\n"
  const lf = content.split("\n").length - 1
  return lf === crlf ? "\r\n" : "\n"
}
