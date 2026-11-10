import { describe, expect, it } from "vitest"
import { classifyAccount, planLabel } from "../src/claude/account.ts"

describe("classifyAccount", () => {
  it("reads a subscription login (shape observed from Claude Code 2.1.321)", () => {
    expect(
      classifyAccount({
        email: "dev@example.com",
        organization: "Example",
        subscriptionType: "Claude Pro",
        apiProvider: "firstParty",
      }),
    ).toEqual({
      _tag: "Connected",
      method: "subscription",
      label: "Claude Pro",
      email: "dev@example.com",
      organization: "Example",
      subscriptionShadowed: false,
    })
  })

  it("reports signed out when Claude Code has no token", () => {
    expect(classifyAccount({ tokenSource: "none", apiProvider: "firstParty" })).toEqual({
      _tag: "SignedOut",
    })
    expect(classifyAccount({ tokenSource: "none", apiKeySource: "none" })).toEqual({
      _tag: "SignedOut",
    })
  })

  it("flags an API key that shadows a stored subscription login", () => {
    expect(
      classifyAccount({
        tokenSource: "claude.ai",
        apiKeySource: "ANTHROPIC_API_KEY",
        apiProvider: "firstParty",
      }),
    ).toEqual({
      _tag: "Connected",
      method: "apiKey",
      label: "API key from ANTHROPIC_API_KEY",
      email: null,
      organization: null,
      subscriptionShadowed: true,
    })
  })

  it("reports an API key without a subscription as not shadowing anything", () => {
    const connection = classifyAccount({ tokenSource: "none", apiKeySource: "apiKeyHelper" })
    expect(connection).toMatchObject({
      _tag: "Connected",
      method: "apiKey",
      label: "API key from apiKeyHelper",
      subscriptionShadowed: false,
    })
  })

  it("treats an auth-token source as an API credential", () => {
    expect(classifyAccount({ tokenSource: "ANTHROPIC_AUTH_TOKEN" })).toMatchObject({
      _tag: "Connected",
      method: "apiKey",
      label: "Auth token from ANTHROPIC_AUTH_TOKEN",
    })
  })

  it("treats any other token source as a subscription login", () => {
    expect(classifyAccount({ tokenSource: "CLAUDE_CODE_OAUTH_TOKEN" })).toMatchObject({
      _tag: "Connected",
      method: "subscription",
      label: "Claude subscription",
    })
  })

  it("names third-party providers", () => {
    expect(classifyAccount({ apiProvider: "bedrock" })).toMatchObject({
      _tag: "Connected",
      method: "cloudProvider",
      label: "Amazon Bedrock",
    })
    expect(classifyAccount({ apiProvider: "somethingNew" })).toMatchObject({
      method: "cloudProvider",
      label: "somethingNew",
    })
  })

  it("does not guess when the account is missing or says nothing", () => {
    expect(classifyAccount(undefined)._tag).toBe("Unavailable")
    expect(classifyAccount({})._tag).toBe("Unavailable")
    expect(classifyAccount({ apiProvider: "firstParty" })._tag).toBe("Unavailable")
  })
})

describe("planLabel", () => {
  it("normalizes raw plan names and keeps readable ones", () => {
    expect(planLabel("pro")).toBe("Claude Pro")
    expect(planLabel("max20x")).toBe("Claude Max")
    expect(planLabel("enterprise")).toBe("Claude Enterprise")
    expect(planLabel("Claude Max")).toBe("Claude Max")
    expect(planLabel("studio")).toBe("Claude Studio")
    expect(planLabel(undefined)).toBe("Claude subscription")
  })
})
