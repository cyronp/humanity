import { type ProviderConnection, ProviderStatus } from "@humanity/contracts"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  accountLine,
  connectionFacts,
  signInCommand,
  signInUsesPowerShell,
  summarizeAccount,
} from "@/features/providers/accounts/summary"

const status = (
  connection: ProviderConnection,
  home: string | null = "/home/me/.claude",
): ProviderStatus => ({
  connection,
  cliVersion: "2.1.321",
  models: [],
  home,
  executable: null,
  checkedAt: "2026-11-10T09:00:00.000Z",
})

type Connected = Extract<ProviderConnection, { _tag: "Connected" }>

const connected = (overrides: Partial<Connected>) =>
  status({
    _tag: "Connected",
    method: "plan",
    label: "Claude Max",
    email: "dev@example.com",
    organization: null,
    subscriptionShadowed: false,
    ...overrides,
  })

describe("summarizeAccount on Claude Code", () => {
  it("shows the plan when the subscription is in use", () => {
    expect(summarizeAccount("claude-code", connected({}))).toEqual({
      short: "Claude Max",
      title: "Connected to your Claude account",
      detail: null,
    })
  })

  it("warns when an API key shadows the subscription", () => {
    const summary = summarizeAccount(
      "claude-code",
      connected({
        method: "apiKey",
        label: "API key from ANTHROPIC_API_KEY",
        subscriptionShadowed: true,
      }),
    )
    expect(summary.short).toBe("API key in use")
    expect(summary.title).toBe("Claude is using an API key instead of your subscription")
  })

  it("names API keys and cloud providers without a warning when nothing is shadowed", () => {
    expect(summarizeAccount("claude-code", connected({ method: "apiKey", label: "x" })).short).toBe(
      "API key",
    )
    expect(
      summarizeAccount(
        "claude-code",
        connected({ method: "cloudProvider", label: "Amazon Bedrock" }),
      ),
    ).toMatchObject({
      title: "Connected through Amazon Bedrock",
      detail: "Billed to this credential, not to a Claude plan.",
    })
  })

  it("asks to sign in, or reports Claude Code as unavailable", () => {
    expect(summarizeAccount("claude-code", status({ _tag: "SignedOut" })).short).toBe(
      "Sign in to Claude",
    )
    expect(
      summarizeAccount("claude-code", status({ _tag: "Unavailable", reason: "ENOENT" })).short,
    ).toBe("Claude unavailable")
  })

  it("round-trips through the wire schema", () => {
    const value = connected({})
    const encoded = Schema.encodeSync(ProviderStatus)(value)
    expect(Schema.decodeUnknownSync(ProviderStatus)(JSON.parse(JSON.stringify(encoded)))).toEqual(
      value,
    )
  })
})

describe("summarizeAccount on the other providers", () => {
  it("tells a ChatGPT plan from a credential billed per token", () => {
    expect(summarizeAccount("codex", connected({ label: "ChatGPT Plus" })).title).toBe(
      "Connected to your ChatGPT account",
    )
    const key = summarizeAccount("codex", connected({ method: "apiKey", label: "OpenAI API key" }))
    expect(key.title).toBe("Connected with an OpenAI API key")
    expect(key.detail).toMatch(/billed/i)
  })

  it("names each provider's own account", () => {
    expect(summarizeAccount("kiro", connected({ label: "Kiro CLI 2.32.0" })).title).toBe(
      "Connected to your Kiro account",
    )
    expect(summarizeAccount("antigravity", connected({ label: "Antigravity CLI" })).title).toBe(
      "Connected to your Google account",
    )
  })

  it("says when nobody is signed in and when the CLI did not start", () => {
    expect(summarizeAccount("codex", status({ _tag: "SignedOut" })).title).toBe(
      "Codex is not signed in",
    )
    expect(summarizeAccount("kiro", status({ _tag: "Unavailable", reason: "x" })).title).toBe(
      "Kiro could not be started",
    )
    expect(summarizeAccount("antigravity", status({ _tag: "SignedOut" })).title).toBe(
      "Antigravity is not signed in",
    )
  })
})

describe("connectionFacts", () => {
  it("lists the plan and who is signed in, leaving out what is unknown", () => {
    expect(connectionFacts("claude-code", connected({ organization: "Acme" }))).toEqual([
      { label: "Plan", value: "Claude Max" },
      { label: "Authenticated as", value: "dev@example.com" },
      { label: "Organization", value: "Acme" },
    ])
    expect(connectionFacts("claude-code", connected({ email: null }))).toEqual([
      { label: "Plan", value: "Claude Max" },
    ])
  })

  it("calls anything but a plan a credential", () => {
    expect(
      connectionFacts("codex", connected({ method: "apiKey", label: "API key", email: null })),
    ).toEqual([{ label: "Credential", value: "API key" }])
  })

  it("leaves out a plan for providers whose CLI names no plan", () => {
    expect(connectionFacts("kiro", connected({ label: "Kiro CLI", email: null }))).toEqual([])
  })

  it("has nothing to say about an account that is not connected", () => {
    expect(connectionFacts("claude-code", status({ _tag: "SignedOut" }))).toEqual([])
  })
})

describe("accountLine", () => {
  it("names the plan and the login of a connected account", () => {
    expect(accountLine("claude-code", connected({}))).toBe("Claude Max · dev@example.com")
    expect(accountLine("codex", connected({ label: "ChatGPT Plus", email: "a@b.c" }))).toBe(
      "ChatGPT Plus · a@b.c",
    )
    expect(accountLine("kiro", connected({ label: "Kiro CLI 2.32.0", email: null }))).toBe(
      "Kiro CLI 2.32.0",
    )
  })

  it("says why an account cannot run sessions", () => {
    expect(accountLine("claude-code", status({ _tag: "SignedOut" }))).toBe(
      "Claude Code is not signed in",
    )
    expect(accountLine("codex", status({ _tag: "Unavailable", reason: "ENOENT" }))).toBe(
      "Codex could not be started",
    )
  })
})

describe("signInCommand", () => {
  it("is the CLI's own login for the default login", () => {
    expect(signInCommand("claude-code", { home: null, executable: null })).toBe("claude auth login")
    expect(signInCommand("codex", { home: null, executable: "codex" })).toBe("codex login")
    expect(signInCommand("antigravity", { home: null, executable: "agy" })).toBe("agy acp --login")
  })

  it("runs the executable Humanity runs, quoted where it needs it", () => {
    expect(
      signInCommand("claude-code", {
        home: null,
        executable: "C:\\Program Files\\sdk\\claude.exe",
      }),
    ).toBe("& 'C:\\Program Files\\sdk\\claude.exe' auth login")
    expect(signInCommand("codex", { home: null, executable: "/opt/my apps/codex" })).toBe(
      "'/opt/my apps/codex' login",
    )
    expect(
      signInCommand("codex", { home: null, executable: "C:\\Users\\o'neil\\$home\\codex.exe" }),
    ).toBe("& 'C:\\Users\\o''neil\\$home\\codex.exe' login")
  })

  it("points an added account's login at its own folder, only for that command", () => {
    expect(
      signInCommand("claude-code", { home: "/home/me/.humanity/accounts/a1", executable: null }),
    ).toBe("CLAUDE_CONFIG_DIR=/home/me/.humanity/accounts/a1 claude auth login")
    expect(
      signInCommand("claude-code", {
        home: "C:\\Users\\me\\.humanity\\accounts\\a1",
        executable: null,
      }),
    ).toBe(
      "$env:CLAUDE_CONFIG_DIR = 'C:\\Users\\me\\.humanity\\accounts\\a1'; claude auth login; Remove-Item Env:CLAUDE_CONFIG_DIR",
    )
    const windows = {
      home: "C:\\Users\\o'neil\\.codex-work",
      executable: "C:\\Humanity\\codex.exe",
    }
    expect(signInCommand("codex", windows)).toBe(
      "$env:CODEX_HOME = 'C:\\Users\\o''neil\\.codex-work'; & 'C:\\Humanity\\codex.exe' login; Remove-Item Env:CODEX_HOME",
    )
    expect(signInCommand("antigravity", { home: "/home/me/.gemini-work", executable: "agy" })).toBe(
      "GEMINI_HOME=/home/me/.gemini-work AGY_ACP_FORCE_FILE_STORAGE=1 agy acp --login",
    )
    expect(signInCommand("antigravity", { home: "C:\\g", executable: "agy" })).toBe(
      "$env:GEMINI_HOME = 'C:\\g'; $env:AGY_ACP_FORCE_FILE_STORAGE = '1'; agy acp --login; Remove-Item Env:GEMINI_HOME, Env:AGY_ACP_FORCE_FILE_STORAGE",
    )
  })

  it("says when the command is meant for PowerShell", () => {
    expect(signInUsesPowerShell({ home: "C:\\a", executable: "codex" })).toBe(true)
    expect(signInUsesPowerShell({ home: null, executable: "C:\\Humanity\\codex.exe" })).toBe(true)
    expect(signInUsesPowerShell({ home: null, executable: "codex" })).toBe(false)
  })

  it("leaves nothing in a path for the shell to read as its own", () => {
    expect(signInCommand("claude-code", { home: "/home/a\"b\\$(id)/it's", executable: null })).toBe(
      "CLAUDE_CONFIG_DIR='/home/a\"b\\$(id)/it'\\''s' claude auth login",
    )
    expect(signInCommand("codex", { home: null, executable: '/opt/a"b\\$(id)`id`/codex' })).toBe(
      "'/opt/a\"b\\$(id)`id`/codex' login",
    )
  })
})
