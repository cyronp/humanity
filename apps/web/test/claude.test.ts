import { ClaudeStatus } from "@humanity/contracts"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  accountLine,
  connectionFacts,
  isReady,
  signInCommand,
  summarizeClaude,
} from "@/features/claude/summary"
import { neighbourStep, parseStep } from "@/features/onboarding/onboarding"

const status = (connection: ClaudeStatus["connection"]): ClaudeStatus => ({
  connection,
  cliVersion: "2.1.321",
  models: [],
  configDir: "/home/me/.claude",
  bundledExecutable: null,
  checkedAt: "2026-11-10T09:00:00.000Z",
})

const connected = (
  overrides: Partial<Extract<ClaudeStatus["connection"], { _tag: "Connected" }>>,
) =>
  status({
    _tag: "Connected",
    method: "subscription",
    label: "Claude Max",
    email: "dev@example.com",
    organization: null,
    subscriptionShadowed: false,
    ...overrides,
  })

describe("summarizeClaude", () => {
  it("shows the plan when the subscription is in use", () => {
    expect(summarizeClaude(connected({}))).toEqual({
      tone: "ok",
      short: "Claude Max",
      title: "Connected to your Claude account",
    })
  })

  it("warns when an API key shadows the subscription", () => {
    const summary = summarizeClaude(
      connected({
        method: "apiKey",
        label: "API key from ANTHROPIC_API_KEY",
        subscriptionShadowed: true,
      }),
    )
    expect(summary.tone).toBe("warning")
    expect(summary.short).toBe("API key in use")
  })

  it("names API keys and cloud providers without a warning when nothing is shadowed", () => {
    expect(summarizeClaude(connected({ method: "apiKey", label: "x" })).short).toBe("API key")
    expect(
      summarizeClaude(connected({ method: "cloudProvider", label: "Amazon Bedrock" })),
    ).toMatchObject({
      tone: "ok",
      title: "Connected through Amazon Bedrock",
    })
  })

  it("asks to sign in, or reports Claude Code as unavailable", () => {
    expect(summarizeClaude(status({ _tag: "SignedOut" })).short).toBe("Sign in to Claude")
    expect(summarizeClaude(status({ _tag: "Unavailable", reason: "ENOENT" })).tone).toBe("error")
  })

  it("is ready only when connected", () => {
    expect(isReady(connected({}))).toBe(true)
    expect(isReady(status({ _tag: "SignedOut" }))).toBe(false)
  })

  it("round-trips through the wire schema", () => {
    const value = connected({})
    const encoded = Schema.encodeSync(ClaudeStatus)(value)
    expect(Schema.decodeUnknownSync(ClaudeStatus)(JSON.parse(JSON.stringify(encoded)))).toEqual(
      value,
    )
  })
})

describe("connectionFacts", () => {
  it("lists the plan and who is signed in, leaving out what is unknown", () => {
    expect(connectionFacts(connected({ organization: "Acme" }))).toEqual([
      { label: "Plan", value: "Claude Max" },
      { label: "Signed in as", value: "dev@example.com" },
      { label: "Organization", value: "Acme" },
    ])
    expect(connectionFacts(connected({ email: null }))).toEqual([
      { label: "Plan", value: "Claude Max" },
    ])
  })

  it("calls anything but a subscription a credential", () => {
    expect(connectionFacts(connected({ method: "apiKey", label: "API key", email: null }))).toEqual(
      [{ label: "Credential", value: "API key" }],
    )
  })

  it("has nothing to say about an account that is not connected", () => {
    expect(connectionFacts(status({ _tag: "SignedOut" }))).toEqual([])
  })
})

describe("accountLine", () => {
  it("names the plan and the login of a connected account", () => {
    expect(accountLine(connected({}))).toBe("Claude Max · dev@example.com")
    expect(accountLine(connected({ email: null }))).toBe("Claude Max")
  })

  it("says why an account cannot run sessions", () => {
    expect(accountLine(status({ _tag: "SignedOut" }))).toBe("Claude Code is not signed in")
    expect(accountLine(status({ _tag: "Unavailable", reason: "ENOENT" }))).toBe(
      "Claude Code could not be started",
    )
  })
})

describe("signInCommand", () => {
  it("is plain `claude auth login` for the default login", () => {
    expect(signInCommand({ configDir: null, executable: null })).toBe("claude auth login")
  })

  it("uses PowerShell's call operator for a bundled Windows CLI", () => {
    expect(
      signInCommand({ configDir: null, executable: "C:\\Program Files\\sdk\\claude.exe" }),
    ).toBe('& "C:\\Program Files\\sdk\\claude.exe" auth login')
  })

  it("quotes a bundled POSIX CLI", () => {
    expect(signInCommand({ configDir: null, executable: "/opt/my sdk/claude" })).toBe(
      '"/opt/my sdk/claude" auth login',
    )
  })

  it("points an added account's login at its own folder, only for that command", () => {
    expect(signInCommand({ configDir: "/home/me/.humanity/accounts/a1", executable: null })).toBe(
      'CLAUDE_CONFIG_DIR="/home/me/.humanity/accounts/a1" claude auth login',
    )
    expect(
      signInCommand({ configDir: "C:\\Users\\me\\.humanity\\accounts\\a1", executable: null }),
    ).toBe(
      '$env:CLAUDE_CONFIG_DIR = "C:\\Users\\me\\.humanity\\accounts\\a1"; claude auth login; Remove-Item Env:CLAUDE_CONFIG_DIR',
    )
  })
})

describe("onboarding steps", () => {
  it("parses only known steps", () => {
    expect(parseStep("connect")).toBe("connect")
    expect(parseStep("nope")).toBeUndefined()
    expect(parseStep(3)).toBeUndefined()
  })

  it("walks forward and back and stops at the ends", () => {
    expect(neighbourStep("welcome", 1)).toBe("connect")
    expect(neighbourStep("connect", 1)).toBe("repositories")
    expect(neighbourStep("ready", -1)).toBe("repositories")
    expect(neighbourStep("welcome", -1)).toBeUndefined()
    expect(neighbourStep("ready", 1)).toBeUndefined()
  })
})
