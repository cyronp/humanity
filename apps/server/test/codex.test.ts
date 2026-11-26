import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { outsideWorktreeDenial, reviewTarget } from "../src/agent/review.ts"
import { codexUserInput } from "../src/agent/CodexRunner.ts"
import { cliVersionOf } from "../src/codex/AppServer.ts"
import { codexPlanUsage } from "../src/codex/Codex.ts"
import {
  codexEnvironment,
  codexNativeExecutable,
  codexTargetTriple,
} from "../src/codex/environment.ts"
import { classifyCodexAccount } from "../src/services/ProviderAccounts.ts"

describe("codexEnvironment", () => {
  it("drops a parent Codex session's variables and keeps everything else", () => {
    expect(
      codexEnvironment({
        PATH: "/usr/bin",
        CODEX_HOME: "/home/me/.codex-work",
        OPENAI_API_KEY: "sk-test",
        CODEX_THREAD_ID: "abc",
        CODEX_SANDBOX: "seatbelt",
        UNSET: undefined,
      }),
    ).toEqual({ PATH: "/usr/bin", CODEX_HOME: "/home/me/.codex-work", OPENAI_API_KEY: "sk-test" })
  })
})

describe("the native Codex executable", () => {
  it("names each platform's build as its package does", () => {
    expect(codexTargetTriple("win32", "x64")).toBe("x86_64-pc-windows-msvc")
    expect(codexTargetTriple("darwin", "arm64")).toBe("aarch64-apple-darwin")
    expect(codexTargetTriple("linux", "x64")).toBe("x86_64-unknown-linux-musl")
    expect(codexTargetTriple("linux", "ia32")).toBeUndefined()
  })

  const npm = join("/npm", "node_modules", "@openai", "codex")
  const script = join(npm, "bin", "codex.js")
  const at =
    (...paths: ReadonlyArray<string>) =>
    (path: string) =>
      paths.includes(path)

  it("is found in the platform package npm installs inside the CLI's own", () => {
    const vendor = join(npm, "node_modules", "@openai", "codex-win32-x64", "vendor")
    const native = join(vendor, "x86_64-pc-windows-msvc", "bin", "codex.exe")
    expect(codexNativeExecutable(script, "win32", "x64", at(native))).toBe(native)
  })

  it("is found in a platform package installed next to the CLI", () => {
    const vendor = join("/npm", "node_modules", "@openai", "codex-linux-arm64", "vendor")
    const native = join(vendor, "aarch64-unknown-linux-musl", "codex", "codex")
    expect(codexNativeExecutable(script, "linux", "arm64", at(native))).toBe(native)
  })

  it("is missing when npm put none there, or for a platform Codex is not built for", () => {
    expect(codexNativeExecutable(script, "win32", "x64", () => false)).toBeUndefined()
    expect(codexNativeExecutable(script, "aix", "ppc64", () => true)).toBeUndefined()
  })
})

describe("cliVersionOf", () => {
  it("reads the version from the user agent", () => {
    expect(cliVersionOf("humanity/0.169.0 (Windows 10.0.26200; x86_64) vscode/1.146.0")).toBe(
      "0.169.0",
    )
    expect(cliVersionOf("")).toBeUndefined()
  })
})

describe("classifyCodexAccount", () => {
  it("reports nobody signed in", () => {
    expect(classifyCodexAccount(null)).toEqual({ _tag: "SignedOut" })
  })

  it("names a ChatGPT plan", () => {
    expect(
      classifyCodexAccount({ type: "chatgpt", email: "dev@example.com", planType: "plus" }),
    ).toEqual({
      _tag: "Connected",
      method: "plan",
      label: "ChatGPT Plus",
      email: "dev@example.com",
      organization: null,
      subscriptionShadowed: false,
    })
  })

  it("tells an API key from a plan", () => {
    expect(classifyCodexAccount({ type: "apiKey" })).toEqual({
      _tag: "Connected",
      method: "apiKey",
      label: "OpenAI API key",
      email: null,
      organization: null,
      subscriptionShadowed: false,
    })
  })
})

describe("codexPlanUsage", () => {
  it("puts the five-hour and the weekly window in their places", () => {
    expect(
      codexPlanUsage({
        rateLimits: {
          primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1_800_000_000 },
          secondary: { usedPercent: 40, windowDurationMins: 10_080, resetsAt: null },
        },
      }),
    ).toEqual({
      fiveHour: { utilization: 12, resetsAt: "2027-01-15T08:00:00.000Z" },
      sevenDay: { utilization: 40, resetsAt: null },
      models: [],
    })
  })

  it("shows a window of another length by its length", () => {
    expect(
      codexPlanUsage({
        rateLimits: { primary: { usedPercent: 3, windowDurationMins: 43_200, resetsAt: null } },
      }),
    ).toEqual({
      fiveHour: null,
      sevenDay: null,
      models: [{ name: "30-day limit", utilization: 3, resetsAt: null }],
    })
  })

  it("has nothing to say for a login without limits", () => {
    expect(codexPlanUsage({ rateLimits: { primary: null, secondary: null } })).toBeUndefined()
  })
})

describe("codexUserInput", () => {
  it("sends images first and text files inline", () => {
    expect(
      codexUserInput({
        text: "Look at these",
        attachments: [
          { kind: "text", name: "notes.md", text: "# Notes" },
          { kind: "image", name: "shot.png", mediaType: "image/png", base64: "AAAA" },
        ],
      }),
    ).toEqual([
      { type: "image", url: "data:image/png;base64,AAAA" },
      {
        type: "text",
        text: 'Look at these\n\n<file name="notes.md">\n# Notes\n</file>',
        text_elements: [],
      },
    ])
  })
})

describe("a Codex patch", () => {
  const worktree = process.platform === "win32" ? "C:\\work\\repo" : "/work/repo"
  const inside = process.platform === "win32" ? "C:\\work\\repo\\src\\a.ts" : "/work/repo/src/a.ts"
  const outside = process.platform === "win32" ? "C:\\work\\other\\b.ts" : "/work/other/b.ts"
  const patch = (...paths: ReadonlyArray<string>) => ({
    changes: paths.map((path) => ({ path, kind: "update", diff: "@@ -1 +1 @@\n-a\n+b\n" })),
  })

  it("is allowed or denied as a whole when every file is inside the session's folder", () => {
    expect(reviewTarget("ApplyPatch", patch(inside, "README.md"), worktree)).toEqual({
      _tag: "Confirm",
    })
    expect(outsideWorktreeDenial("ApplyPatch", patch(inside), worktree)).toBeUndefined()
  })

  it("is denied when one of its files is outside the session's folder", () => {
    const target = reviewTarget("ApplyPatch", patch(inside, outside), worktree)
    expect(target._tag).toBe("Deny")
    expect(outsideWorktreeDenial("ApplyPatch", patch(inside, outside), worktree)).toContain(
      "outside the folder this session works in",
    )
  })

  it("is denied when it moves a file out of the session's folder", () => {
    const input = { changes: [{ path: inside, kind: "update", movePath: outside, diff: "" }] }
    expect(outsideWorktreeDenial("ApplyPatch", input, worktree)).toContain(outside)
  })

  it("is denied when it names no files", () => {
    expect(reviewTarget("ApplyPatch", {}, worktree)._tag).toBe("Deny")
  })
})
