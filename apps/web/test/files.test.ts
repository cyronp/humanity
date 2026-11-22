import type { FileDiff } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  closeTab,
  lineBreakOf,
  NO_TABS,
  onDiskChange,
  openTab,
} from "../src/features/files/tabs.ts"
import { ancestorsOf, buildFileTree, ROOT_ID, treeChanges } from "../src/features/files/tree.ts"

describe("buildFileTree", () => {
  it("nests files under their folders, folders first, in natural order", () => {
    const tree = buildFileTree([
      "src/b.ts",
      "README.md",
      "src/a10.ts",
      "src/a2.ts",
      "src/lib/x.ts",
      "a.txt",
    ])
    expect(tree.get(ROOT_ID)?.children).toEqual(["src", "a.txt", "README.md"])
    expect(tree.get("src")?.children).toEqual(["src/lib", "src/a2.ts", "src/a10.ts", "src/b.ts"])
    expect(tree.get("src/lib")).toEqual({
      id: "src/lib",
      name: "lib",
      folder: true,
      children: ["src/lib/x.ts"],
    })
    expect(tree.get("src/a2.ts")).toEqual({
      id: "src/a2.ts",
      name: "a2.ts",
      folder: false,
      children: [],
    })
  })

  it("has a root even without files", () => {
    expect(buildFileTree([]).get(ROOT_ID)?.children).toEqual([])
  })
})

describe("ancestorsOf", () => {
  it("lists the folders above a path, outermost first", () => {
    expect(ancestorsOf("a/b/c.ts")).toEqual(["a", "a/b"])
    expect(ancestorsOf("c.ts")).toEqual([])
  })
})

describe("treeChanges", () => {
  it("marks changed files and every folder above them", () => {
    const file = (filePath: string, kind: FileDiff["kind"]): FileDiff => ({
      filePath,
      kind,
      binary: false,
      hunks: [],
    })
    const changes = treeChanges([file("src/lib/a.ts", "modify"), file("b.ts", "create")])
    expect(changes.files.get("src/lib/a.ts")).toBe("modify")
    expect(changes.files.get("b.ts")).toBe("create")
    expect([...changes.folders]).toEqual(["src", "src/lib"])
  })
})

describe("tabs", () => {
  it("opens a tab after the active one and focuses an open one", () => {
    let tabs = openTab(NO_TABS, "a")
    tabs = openTab(tabs, "b")
    tabs = openTab({ ...tabs, active: "a" }, "c")
    expect(tabs).toEqual({ open: ["a", "c", "b"], active: "c" })
    expect(openTab(tabs, "b")).toEqual({ open: ["a", "c", "b"], active: "b" })
  })

  it("moves to the neighbour when the active tab closes", () => {
    const tabs = { open: ["a", "b", "c"], active: "b" }
    expect(closeTab(tabs, "b")).toEqual({ open: ["a", "c"], active: "c" })
    expect(closeTab({ ...tabs, active: "c" }, "c")).toEqual({ open: ["a", "b"], active: "b" })
    expect(closeTab(tabs, "a")).toEqual({ open: ["b", "c"], active: "b" })
    expect(closeTab({ open: ["a"], active: "a" }, "a")).toEqual(NO_TABS)
  })
})

describe("onDiskChange", () => {
  it("reloads a clean file that changed on disk", () => {
    expect(onDiskChange({ opened: "1", onDisk: "2", dirty: false, acknowledged: undefined })).toBe(
      "reload",
    )
  })

  it("asks when a file with unsaved changes changed on disk", () => {
    expect(onDiskChange({ opened: "1", onDisk: "2", dirty: true, acknowledged: undefined })).toBe(
      "conflict",
    )
  })

  it("asks when the file was deleted", () => {
    expect(onDiskChange({ opened: "1", onDisk: null, dirty: false, acknowledged: undefined })).toBe(
      "conflict",
    )
  })

  it("stays quiet about a version already shown, and about no change", () => {
    expect(onDiskChange({ opened: "1", onDisk: "2", dirty: true, acknowledged: "2" })).toBe("none")
    expect(onDiskChange({ opened: "1", onDisk: "1", dirty: true, acknowledged: undefined })).toBe(
      "none",
    )
  })
})

describe("lineBreakOf", () => {
  it("keeps CRLF only when every line uses it", () => {
    expect(lineBreakOf("a\r\nb\r\n")).toBe("\r\n")
    expect(lineBreakOf("a\nb\n")).toBe("\n")
    expect(lineBreakOf("a\r\nb\n")).toBe("\n")
    expect(lineBreakOf("one line")).toBe("\n")
  })
})
