import {
  file,
  fileExtensions,
  fileNames,
  folder,
  folderExpanded,
  folderNames,
  light,
} from "material-icon-theme/dist/material-icons.json"
import { cn } from "cn"
import { useResolvedTheme } from "@/features/terminal/theme"
import { iconNameFor, iconUrlFor } from "./fileIcons.ts"
import { nameOf } from "./tree.ts"

const manifest = { file, folder, folderExpanded, fileNames, fileExtensions, folderNames, light }

const globbed = import.meta.glob<string>("@material-icons/*.svg", {
  query: "?no-inline",
  import: "default",
  eager: true,
})

const urls: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(globbed).map(([path, url]) => [nameOf(path).replace(/\.svg$/, ""), url]),
)

export function FileIcon({
  path,
  folder: isFolder = false,
  expanded = false,
  className,
}: {
  readonly path: string
  readonly folder?: boolean
  readonly expanded?: boolean
  readonly className?: string
}) {
  const theme = useResolvedTheme()
  const icon = iconNameFor(manifest, nameOf(path), {
    folder: isFolder,
    expanded,
    light: theme === "light",
  })
  const url = iconUrlFor(urls, icon, isFolder ? (expanded ? folderExpanded : folder) : file)
  if (url === undefined)
    return <span aria-hidden="true" className={cn("size-4 shrink-0", className)} />
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("size-4 shrink-0", className)}
    />
  )
}
