export interface Listener {
  readonly host: string
  readonly port: number
  readonly pid: number
  readonly processName?: string | undefined
}

export interface ProcessRow {
  readonly pid: number
  readonly ppid: number
  readonly name: string
}

const LOOPBACK_OR_ANY = new Set(["127.0.0.1", "0.0.0.0", "::1", "::", "*"])

export const reachableLocally = (host: string): boolean =>
  LOOPBACK_OR_ANY.has(host) || host.startsWith("127.")

const splitAddress = (address: string): { host: string; port: number } | undefined => {
  const match = /^\[?([^\]]*?)\]?:(\d+)$/.exec(address)
  if (match === null) return undefined
  const port = Number(match[2])
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return undefined
  return { host: match[1] === "" ? "*" : (match[1] ?? "*"), port }
}

export const parseNetstat = (text: string): ReadonlyArray<Listener> => {
  const listeners: Array<Listener> = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^TCP\s+(\S+)\s+(\S+)\s+\S+\s+(\d+)$/i.exec(line.trim())
    if (match === null) continue
    const foreign = match[2] ?? ""
    if (!/^(?:0\.0\.0\.0|\[::\]|\*):(?:0|\*)$/.test(foreign)) continue
    const local = splitAddress(match[1] ?? "")
    if (local === undefined) continue
    listeners.push({ ...local, pid: Number(match[3]) })
  }
  return listeners
}

export const parseLsof = (text: string): ReadonlyArray<Listener> => {
  const listeners: Array<Listener> = []
  let pid: number | undefined
  let name: string | undefined
  for (const line of text.split(/\r?\n/)) {
    const field = line[0]
    const value = line.slice(1)
    if (field === "p") {
      pid = Number(value)
      name = undefined
    } else if (field === "c") {
      name = value
    } else if (field === "n" && pid !== undefined) {
      const local = splitAddress(value)
      if (local !== undefined) listeners.push({ ...local, pid, processName: name })
    }
  }
  return listeners
}

export const parseSs = (text: string): ReadonlyArray<Listener> => {
  const listeners: Array<Listener> = []
  for (const line of text.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/)
    const local = splitAddress((columns[3] ?? "").replace(/%\S+?:/, ":"))
    const users = /users:\(\("([^"]*)",pid=(\d+)/.exec(line)
    if (local === undefined || users === null) continue
    listeners.push({ ...local, pid: Number(users[2]), processName: users[1] })
  }
  return listeners
}

export const parseProcesses = (text: string): ReadonlyArray<ProcessRow> => {
  const rows: Array<ProcessRow> = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^(\d+)\s+(\d+)\s+(.+)$/.exec(line.trim())
    if (match === null) continue
    const name = (match[3] ?? "").split(/[\\/]/).at(-1) ?? ""
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), name })
  }
  return rows
}

export const ancestorIn = <T>(
  pid: number,
  parents: ReadonlyMap<number, number>,
  roots: ReadonlyMap<number, T>,
): T | undefined => {
  let current: number | undefined = pid
  for (let depth = 0; depth < 64 && current !== undefined && current > 0; depth++) {
    const root = roots.get(current)
    if (root !== undefined) return root
    const parent = parents.get(current)
    if (parent === current) return undefined
    current = parent
  }
  return undefined
}

export const descendantsOf = (
  pid: number,
  processes: ReadonlyArray<ProcessRow>,
): ReadonlyArray<number> => {
  const children = new Map<number, Array<number>>()
  for (const row of processes) {
    if (row.pid === row.ppid) continue
    const list = children.get(row.ppid) ?? []
    list.push(row.pid)
    children.set(row.ppid, list)
  }
  const found: Array<number> = []
  const queue = [pid]
  const seen = new Set<number>()
  while (queue.length > 0) {
    const next = queue.shift()
    if (next === undefined || seen.has(next)) continue
    seen.add(next)
    found.push(next)
    queue.push(...(children.get(next) ?? []))
  }
  return found
}

const matchesSource = (source: string, embedder: URL): boolean => {
  if (source === "*") return true
  if (source === `${embedder.protocol}`) return true
  const match = /^(?:([a-z][a-z\d+.-]*):\/\/)?([^/:]+)(?::(\d+|\*))?/i.exec(source)
  if (match === null) return false
  const [, scheme, host, port] = match
  if (scheme !== undefined && `${scheme.toLowerCase()}:` !== embedder.protocol) return false
  const hostMatches = host?.startsWith("*.")
    ? embedder.hostname.endsWith(host.slice(1))
    : host?.toLowerCase() === embedder.hostname
  if (!hostMatches) return false
  const embedderPort = embedder.port || (embedder.protocol === "https:" ? "443" : "80")
  return port === "*" || (port ?? (embedder.protocol === "https:" ? "443" : "80")) === embedderPort
}

export const framingOf = (
  headers: { readonly get: (name: string) => string | null },
  embedder: string,
): string | undefined => {
  let origin: URL
  try {
    origin = new URL(embedder)
  } catch {
    return undefined
  }
  const policy = headers.get("content-security-policy")
  const ancestors = policy
    ?.split(",")
    .flatMap((each) => each.split(";"))
    .map((directive) => directive.trim().split(/\s+/))
    .find(([name]) => name?.toLowerCase() === "frame-ancestors")
  if (ancestors !== undefined) {
    const sources = ancestors.slice(1)
    if (sources.some((source) => matchesSource(source.replace(/^'|'$/g, ""), origin))) {
      return undefined
    }
    return `The page refuses to be shown in a frame (Content-Security-Policy: frame-ancestors ${sources.join(" ") || "'none'"}).`
  }
  const options = headers.get("x-frame-options")?.trim().toUpperCase()
  if (options === "DENY" || options === "SAMEORIGIN" || options?.startsWith("ALLOW-FROM")) {
    return `The page refuses to be shown in a frame (X-Frame-Options: ${options}).`
  }
  return undefined
}
