import { isAbsolute, relative, resolve } from "node:path"

/**
 * True when `child` is strictly inside `parent`. Guards every place Humanity
 * deletes or writes files, so nothing outside its own directories is touched.
 */
export const isInsideDir = (parent: string, child: string): boolean => {
  const path = relative(resolve(parent), resolve(child))
  return path !== "" && !path.startsWith("..") && !isAbsolute(path)
}
