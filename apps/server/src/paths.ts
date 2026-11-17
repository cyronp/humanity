import { isAbsolute, join, relative, resolve } from "node:path"

export const expandHome = (path: string, home: string): string => {
  if (path === "~") return home
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2))
  return path
}

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

export const isInsideDir = (parent: string, child: string): boolean => {
  const path = relative(resolve(parent), resolve(child))
  return path !== "" && !path.startsWith("..") && !isAbsolute(path)
}
