import { describe, expect, it } from "vitest"
import { fileTypeOf } from "@/features/chat/FileTypeIcon"

const brandOf = (path: string, directory = false) => {
  const type = fileTypeOf(path, directory)
  return "brand" in type ? type.brand : undefined
}

describe("the icon of a file", () => {
  it("shows the logo of the language", () => {
    expect(brandOf("src/app.ts")).toBe("typescript")
    expect(brandOf("src/App.tsx")).toBe("react")
    expect(brandOf("scripts/build.mjs")).toBe("javascript")
    expect(brandOf("styles/main.css")).toBe("css")
    expect(brandOf("index.html")).toBe("html")
    expect(brandOf("tool/main.py")).toBe("python")
    expect(brandOf("cmd/main.go")).toBe("go")
    expect(brandOf("src/lib.rs")).toBe("rust")
  })

  it("knows files by their name before their extension", () => {
    expect(brandOf("apps/web/package.json")).toBe("npm")
    expect(brandOf("tsconfig.base.json")).toBe("typescript")
    expect(brandOf("apps/web/vite.config.ts")).toBe("vite")
    expect(brandOf("eslint.config.js")).toBe("eslint")
    expect(brandOf(".env.local")).toBe("dotenv")
    expect(brandOf("Dockerfile")).toBe("docker")
    expect(brandOf(".gitignore")).toBe("git")
  })

  it("shows a plain icon for folders and unknown files", () => {
    expect(brandOf("src", true)).toBeUndefined()
    expect(brandOf("src/")).toBeUndefined()
    expect(brandOf("LICENSE")).toBeUndefined()
    expect(brandOf("notes.unknown")).toBeUndefined()
  })
})
