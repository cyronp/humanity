import { describe, expect, it } from "vitest"
import { vscodeUrl } from "@/lib/editor"

describe("vscodeUrl", () => {
  it("opens a file under a Windows folder, at a line", () => {
    expect(vscodeUrl("C:\\Users\\me\\repo\\", "src/app.ts", 12)).toBe(
      "vscode://file/C:/Users/me/repo/src/app.ts:12",
    )
  })

  it("opens a file under a POSIX folder, without a line", () => {
    expect(vscodeUrl("/home/me/repo", "src/app.ts")).toBe("vscode://file/home/me/repo/src/app.ts")
  })

  it("escapes characters a URL would misread", () => {
    expect(vscodeUrl("/home/me/my repo", "docs/a#b?.md", 1)).toBe(
      "vscode://file/home/me/my%20repo/docs/a%23b%3F.md:1",
    )
  })
})
