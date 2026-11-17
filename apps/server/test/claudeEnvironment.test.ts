import { CLI_MINIMUM_VERSIONS } from "@humanity/contracts"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { claudeConfigDir, claudeEnvironment } from "../src/claude/environment.ts"

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

describe("the oldest Claude Code Humanity runs", () => {
  it("is the one the Agent SDK is built for", () => {
    // The SDK exports no `package.json`; it sits next to its entry point.
    const entry = createRequire(import.meta.url).resolve("@anthropic-ai/claude-agent-sdk")
    const sdk = JSON.parse(readFileSync(join(dirname(entry), "package.json"), "utf8")) as {
      readonly claudeCodeVersion: string
    }
    expect(CLI_MINIMUM_VERSIONS["claude-code"]).toBe(sdk.claudeCodeVersion)
  })
})
