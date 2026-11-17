export const vscodeUrl = (root: string, filePath: string, line?: number): string => {
  const path = `${root.replace(/[\\/]+$/, "")}/${filePath}`.replaceAll("\\", "/")
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ":"))
    .join("/")
  const absolute = encoded.startsWith("/") ? encoded : `/${encoded}`
  return `vscode://file${absolute}${line === undefined ? "" : `:${line}`}`
}
