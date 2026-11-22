type IconMap = Readonly<Record<string, string>>

export interface IconManifest {
  readonly file: string
  readonly folder: string
  readonly folderExpanded: string
  readonly fileNames: IconMap
  readonly fileExtensions: IconMap
  readonly folderNames: IconMap
  readonly light?: {
    readonly fileNames?: IconMap
    readonly fileExtensions?: IconMap
    readonly folderNames?: IconMap
    readonly folderNamesExpanded?: IconMap
  }
}

export interface IconRequest {
  readonly folder: boolean
  readonly expanded: boolean
  readonly light: boolean
}

const pick = (key: string, light: IconMap | undefined, base: IconMap): string | undefined =>
  (light !== undefined && Object.hasOwn(light, key) ? light[key] : undefined) ??
  (Object.hasOwn(base, key) ? base[key] : undefined)

const lookup = (name: string, light: IconMap | undefined, base: IconMap) =>
  pick(name, light, base) ?? pick(name.toLowerCase(), light, base)

const folderIcon = (manifest: IconManifest, name: string, request: IconRequest) => {
  const lightTheme = request.light ? manifest.light : undefined
  if (request.expanded) {
    const lightOpen =
      lightTheme?.folderNamesExpanded === undefined
        ? undefined
        : lookup(name, lightTheme.folderNamesExpanded, {})
    if (lightOpen !== undefined) return lightOpen
    const closed = lookup(name, undefined, manifest.folderNames)
    return closed === undefined ? manifest.folderExpanded : `${closed}-open`
  }
  return lookup(name, lightTheme?.folderNames, manifest.folderNames) ?? manifest.folder
}

const fileIcon = (manifest: IconManifest, name: string, request: IconRequest) => {
  const lightTheme = request.light ? manifest.light : undefined
  const byName = lookup(name, lightTheme?.fileNames, manifest.fileNames)
  if (byName !== undefined) return byName
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) {
    const extension = name.slice(dot + 1)
    if (extension === "") break
    const byExtension = lookup(extension, lightTheme?.fileExtensions, manifest.fileExtensions)
    if (byExtension !== undefined) return byExtension
  }
  return manifest.file
}

export const iconNameFor = (manifest: IconManifest, name: string, request: IconRequest): string =>
  request.folder ? folderIcon(manifest, name, request) : fileIcon(manifest, name, request)

export const iconUrlFor = (
  urls: Readonly<Record<string, string>>,
  icon: string,
  fallback: string,
): string | undefined => urls[icon] ?? urls[`${icon}.clone`] ?? urls[fallback]
