import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  bundledClaudeExecutable,
  bundledExecutablePackages,
  claudeConfigDir,
  claudeEnvironment,
} from "../src/claude/environment.ts"

describe("claudeEnvironment", () => {
  it("drops a parent Claude Code session's variables and keeps everything else", () => {
    const env = claudeEnvironment({
      PATH: "/usr/bin",
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_SESSION_ID: "abc",
      CLAUDE_CONFIG_DIR: "/home/me/.claude-work",
      ANTHROPIC_API_KEY: "sk-ant-test",
      UNSET: undefined,
    })
    expect(env).toEqual({
      PATH: "/usr/bin",
      CLAUDE_CONFIG_DIR: "/home/me/.claude-work",
      ANTHROPIC_API_KEY: "sk-ant-test",
    })
  })
})

describe("claudeConfigDir", () => {
  it("follows CLAUDE_CONFIG_DIR like the CLI, else ~/.claude", () => {
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: "/x/claude" }, "/home/me")).toBe("/x/claude")
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: "  " }, "/home/me")).toBe(
      join("/home/me", ".claude"),
    )
    expect(claudeConfigDir({}, "/home/me")).toBe(join("/home/me", ".claude"))
  })
})

describe("bundled executable", () => {
  it("lists the SDK's platform packages, musl after glibc on Linux", () => {
    expect(bundledExecutablePackages("win32", "x64")).toEqual([
      "@anthropic-ai/claude-agent-sdk-win32-x64",
    ])
    expect(bundledExecutablePackages("linux", "arm64")).toEqual([
      "@anthropic-ai/claude-agent-sdk-linux-arm64",
      "@anthropic-ai/claude-agent-sdk-linux-arm64-musl",
    ])
  })

  it("finds the CLI installed with the SDK on this machine", () => {
    const path = bundledClaudeExecutable()
    expect(path).not.toBeNull()
    expect(path).toMatch(/claude(\.exe)?$/)
  })

  it("returns null for a platform whose package is not installed", () => {
    expect(bundledClaudeExecutable("aix", "ppc64")).toBeNull()
  })
})
