import { cn } from "cn"
import {
  Database,
  File,
  FileImage,
  FileText,
  Folder,
  Lock,
  type LucideIcon,
  SquareTerminal,
} from "lucide-react"
import type { CSSProperties } from "react"
import { type BrandIcon, type BrandIconName, brandIcons } from "./brandIcons.ts"

type FileType =
  { readonly brand: BrandIconName } | { readonly icon: LucideIcon; readonly className: string }

const brand = (name: BrandIconName): FileType => ({ brand: name })
const plain = (icon: LucideIcon, className = "text-muted-foreground"): FileType => ({
  icon,
  className,
})

const image = plain(FileImage, "text-emerald-600 dark:text-emerald-400")

const byName: Readonly<Record<string, FileType>> = {
  "package.json": brand("npm"),
  "package-lock.json": brand("npm"),
  "turbo.json": brand("turborepo"),
  dockerfile: brand("docker"),
  ".dockerignore": brand("docker"),
  ".gitignore": brand("git"),
  ".gitattributes": brand("git"),
  ".gitmodules": brand("git"),
  ".nvmrc": brand("node"),
  ".node-version": brand("node"),
  ".prettierrc": brand("prettier"),
  ".prettierignore": brand("prettier"),
}

const byPattern: ReadonlyArray<readonly [RegExp, FileType]> = [
  [/^\.env(\..*)?$/, brand("dotenv")],
  [/^tsconfig(\..*)?\.json$/, brand("typescript")],
  [/^vite\.config\./, brand("vite")],
  [/^vitest\.(config|workspace)\./, brand("vitest")],
  [/^(eslint\.config\.|\.eslintrc)/, brand("eslint")],
  [/^(prettier\.config\.|\.prettierrc\.)/, brand("prettier")],
  [/^tailwind\.config\./, brand("tailwindcss")],
  [/^next\.config\./, brand("next")],
  [/^electron-builder\./, brand("electron")],
  [/^(docker-)?compose(\..*)?\.ya?ml$/, brand("docker")],
]

const byExtension: Readonly<Record<string, FileType>> = {
  ts: brand("typescript"),
  mts: brand("typescript"),
  cts: brand("typescript"),
  tsx: brand("react"),
  jsx: brand("react"),
  js: brand("javascript"),
  mjs: brand("javascript"),
  cjs: brand("javascript"),
  json: brand("json"),
  jsonc: brand("json"),
  css: brand("css"),
  scss: brand("sass"),
  sass: brand("sass"),
  html: brand("html"),
  htm: brand("html"),
  md: brand("markdown"),
  mdx: brand("mdx"),
  py: brand("python"),
  go: brand("go"),
  rs: brand("rust"),
  php: brand("php"),
  rb: brand("ruby"),
  kt: brand("kotlin"),
  kts: brand("kotlin"),
  swift: brand("swift"),
  c: brand("c"),
  h: brand("c"),
  cpp: brand("cpp"),
  cc: brand("cpp"),
  cxx: brand("cpp"),
  hpp: brand("cpp"),
  hh: brand("cpp"),
  java: brand("java"),
  lua: brand("lua"),
  dart: brand("dart"),
  vue: brand("vue"),
  svelte: brand("svelte"),
  astro: brand("astro"),
  graphql: brand("graphql"),
  gql: brand("graphql"),
  zig: brand("zig"),
  ex: brand("elixir"),
  exs: brand("elixir"),
  hs: brand("haskell"),
  scala: brand("scala"),
  sh: brand("bash"),
  bash: brand("bash"),
  zsh: brand("bash"),
  yml: brand("yaml"),
  yaml: brand("yaml"),
  toml: brand("toml"),
  svg: brand("svg"),
  db: brand("sqlite"),
  sqlite: brand("sqlite"),
  sqlite3: brand("sqlite"),
  sql: plain(Database, "text-amber-600 dark:text-amber-400"),
  ps1: plain(SquareTerminal, "text-sky-600 dark:text-sky-400"),
  txt: plain(FileText),
  lock: plain(Lock),
  png: image,
  jpg: image,
  jpeg: image,
  gif: image,
  webp: image,
  ico: image,
}

const fallback = plain(File)
const folder = plain(Folder)

export const fileTypeOf = (path: string, directory = false): FileType => {
  if (directory || path.endsWith("/")) return folder
  const name = (path.slice(path.lastIndexOf("/") + 1) || path).toLowerCase()
  const named = byName[name] ?? byPattern.find(([pattern]) => pattern.test(name))?.[1]
  if (named !== undefined) return named
  const dot = name.lastIndexOf(".")
  return (dot > 0 ? byExtension[name.slice(dot + 1)] : undefined) ?? fallback
}

const toneClass: Readonly<Record<BrandIcon["tone"], string>> = {
  brand: "text-(--brand-icon)",
  mono: "",
  lighten: "text-(--brand-icon) dark:text-[color-mix(in_oklab,var(--brand-icon),white_40%)]",
  darken: "text-[color-mix(in_oklab,var(--brand-icon),black_30%)] dark:text-(--brand-icon)",
}

export function FileTypeIcon({
  path,
  directory = false,
  tight = false,
  className,
}: {
  readonly path: string
  readonly directory?: boolean
  readonly tight?: boolean
  readonly className?: string
}) {
  const type = fileTypeOf(path, directory)
  if ("brand" in type) {
    const icon: BrandIcon = brandIcons[type.brand]
    return (
      <svg
        aria-hidden
        viewBox={tight ? "0 0 24 24" : "-1.5 -1.5 27 27"}
        fill="currentColor"
        style={{ "--brand-icon": icon.hex } as CSSProperties}
        className={cn("size-4 shrink-0", toneClass[icon.tone], className)}
      >
        <path d={icon.path} />
      </svg>
    )
  }
  const Icon = type.icon
  return <Icon aria-hidden className={cn("size-4 shrink-0", type.className, className)} />
}
