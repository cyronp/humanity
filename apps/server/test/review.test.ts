import { Effect } from "effect"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { isProtectedPath, placeEdit } from "../src/agent/review.ts"

describe("isProtectedPath", () => {
  it("covers git's, the agents' and the editors' own files", () => {
    for (const path of [
      ".git/config",
      ".git/hooks/pre-commit",
      ".git",
      ".claude/settings.json",
      "packages/app/.vscode/tasks.json",
      ".mcp.json",
      ".gitmodules",
      ".Husky/pre-commit",
      ".codex/config.toml",
      "nested\\.GIT\\config",
    ]) {
      expect(isProtectedPath(path), path).toBe(true)
    }
  })

  it("leaves ordinary files alone", () => {
    for (const path of ["src/app.ts", ".gitignore", "docs/.mcp.json.md", "git/config"]) {
      expect(isProtectedPath(path), path).toBe(false)
    }
  })
})

describe("placeEdit", () => {
  const folders: Array<string> = []
  const folder = () => {
    const made = mkdtempSync(join(tmpdir(), "humanity-review-"))
    folders.push(made)
    return made
  }
  afterEach(() => {
    for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true })
  })

  const place = (path: string, worktree: string) =>
    Effect.runPromise(placeEdit("Write", { file_path: path, content: "" }, worktree))

  it("lets a new file in a new folder through", async () => {
    const worktree = folder()
    expect(await place("src/new/file.ts", worktree)).toEqual({
      denial: undefined,
      protectedPath: undefined,
    })
  })

  it("names a protected file, by its real path too", async () => {
    const worktree = folder()
    mkdirSync(join(worktree, ".git"))
    symlinkSync(join(worktree, ".git"), join(worktree, "innocent"), "junction")
    expect((await place(".git/config", worktree)).protectedPath).toBe(".git/config")
    expect((await place("innocent/config", worktree)).protectedPath).toBe("innocent/config")
  })

  it("denies a link that leads outside, or nowhere", async () => {
    const worktree = folder()
    const outside = folder()
    symlinkSync(outside, join(worktree, "out"), "junction")
    symlinkSync(join(outside, "missing"), join(worktree, "gone"), "junction")
    expect((await place("out/file.txt", worktree)).denial).toMatch(/through a link/)
    expect((await place("gone/file.txt", worktree)).denial).toMatch(/through a link/)
  })
})
