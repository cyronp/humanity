import { ClaudeStatus } from "@humanity/contracts"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { bundledLoginCommand, isReady, summarizeClaude } from "@/features/claude/summary"
import { neighbourStep, parseStep } from "@/features/onboarding/onboarding"

const status = (connection: ClaudeStatus["connection"]): ClaudeStatus => ({
  connection,
  cliVersion: "2.1.321",
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

describe("bundledLoginCommand", () => {
  it("uses PowerShell's call operator for a Windows path", () => {
    expect(bundledLoginCommand("C:\\Program Files\\sdk\\claude.exe")).toBe(
      '& "C:\\Program Files\\sdk\\claude.exe" auth login',
    )
  })

  it("quotes a POSIX path", () => {
    expect(bundledLoginCommand("/opt/my sdk/claude")).toBe('"/opt/my sdk/claude" auth login')
  })
})

describe("onboarding steps", () => {
  it("parses only known steps", () => {
    expect(parseStep("connect")).toBe("connect")
    expect(parseStep("nope")).toBeUndefined()
    expect(parseStep(3)).toBeUndefined()
  })

  it("walks forward and back and stops at the ends", () => {
    expect(neighbourStep("welcome", 1)).toBe("how-it-works")
    expect(neighbourStep("welcome", -1)).toBeUndefined()
    expect(neighbourStep("ready", 1)).toBeUndefined()
  })
})
