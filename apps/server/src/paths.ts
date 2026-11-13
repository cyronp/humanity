import { isAbsolute, join, relative, resolve } from "node:path"

/** `~`, `~/x` and `~\x` start at `home`; any other path is returned as given. */
export const expandHome = (path: string, home: string): string => {
  if (path === "~") return home
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2))
  return path
}

/** True when both paths name the same folder; case-insensitive on Windows and macOS. */
export const isSamePath = (
  a: string,
  b: string,
  platform: NodeJS.Platform = process.platform,
): boolean => {
  const normalize = (path: string) => {
    const resolved = resolve(path)
    return platform === "win32" || platform === "darwin" ? resolved.toLowerCase() : resolved
  }
  return normalize(a) === normalize(b)
}

/**
 * True when `child` is strictly inside `parent`. Guards every place Humanity
 * deletes or writes files, so nothing outside its own directories is touched.
 */
export const isInsideDir = (parent: string, child: string): boolean => {
  const path = relative(resolve(parent), resolve(child))
  return path !== "" && !path.startsWith("..") && !isAbsolute(path)
}
