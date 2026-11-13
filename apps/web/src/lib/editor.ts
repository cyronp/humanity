/**
 * A `vscode://file/…` link that opens `filePath` (relative to `root`, the
 * folder the session works in) in VS Code, at `line` when given. The browser
 * hands it to VS Code; nothing goes through the daemon.
 */
export const vscodeUrl = (root: string, filePath: string, line?: number): string => {
  const path = `${root.replace(/[\\/]+$/, "")}/${filePath}`.replaceAll("\\", "/")
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ":"))
    .join("/")
  const absolute = encoded.startsWith("/") ? encoded : `/${encoded}`
  return `vscode://file${absolute}${line === undefined ? "" : `:${line}`}`
}
