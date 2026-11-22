import {
  file,
  fileExtensions,
  fileNames,
  folder,
  folderExpanded,
  folderNames,
  light,
} from "material-icon-theme/dist/material-icons.json"
import { describe, expect, it } from "vitest"
import { iconNameFor, iconUrlFor } from "../src/features/files/fileIcons.ts"

const manifest = { file, folder, folderExpanded, fileNames, fileExtensions, folderNames, light }

const fileOf = (name: string, isLight = false) =>
  iconNameFor(manifest, name, { folder: false, expanded: false, light: isLight })

const folderOf = (name: string, expanded: boolean) =>
  iconNameFor(manifest, name, { folder: true, expanded, light: false })

describe("iconNameFor", () => {
  it("names a file by its extension", () => {
    expect(fileOf("greet.ts")).toBe("typescript")
    expect(fileOf("util.py")).toBe("python")
    expect(fileOf("App.tsx")).toBe("react_ts")
    expect(fileOf("main.rs")).toBe("rust")
  })

  it("prefers the longest extension, as in types.d.ts", () => {
    expect(fileOf("types.d.ts")).toBe("typescript-def")
  })

  it("prefers the whole file name, in any case", () => {
    expect(fileOf("package.json")).toBe("nodejs")
    expect(fileOf("README.md")).toBe(fileNames["readme.md"])
  })

  it("falls back to the plain file icon", () => {
    expect(fileOf("notes.unknown-extension")).toBe("file")
  })

  it("names folders, and opens them when expanded", () => {
    expect(folderOf("src", false)).toBe("folder-src")
    expect(folderOf("src", true)).toBe("folder-src-open")
    expect(folderOf("no-such-folder-name", false)).toBe("folder")
    expect(folderOf("no-such-folder-name", true)).toBe("folder-open")
  })

  it("uses a light variant where the theme has one", () => {
    const [name, icon] = Object.entries(light.fileNames)[0] ?? ["", ""]
    expect(fileOf(name, true)).toBe(icon)
  })
})

describe("iconUrlFor", () => {
  it("finds icons kept in a .clone file, and falls back", () => {
    const urls = { "latex.clone": "/latex.svg", file: "/file.svg" }
    expect(iconUrlFor(urls, "latex", "file")).toBe("/latex.svg")
    expect(iconUrlFor(urls, "missing", "file")).toBe("/file.svg")
  })
})
