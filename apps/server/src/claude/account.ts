import type { ClaudeConnection } from "@humanity/contracts"

/**
 * The `account` Claude Code reports when it initializes (the Agent SDK's
 * `AccountInfo`). Only the fields Humanity reads are listed. Observed shapes:
 *
 * - signed in with a subscription: `{ email, organization, subscriptionType: "Claude Pro", apiProvider: "firstParty" }`
 * - signed out:                    `{ tokenSource: "none", apiProvider: "firstParty" }`
 * - `ANTHROPIC_API_KEY` set:       `{ tokenSource: "claude.ai", apiKeySource: "ANTHROPIC_API_KEY", apiProvider: "firstParty" }`
 */
export interface ReportedAccount {
  readonly email?: string | undefined
  readonly organization?: string | undefined
  readonly subscriptionType?: string | undefined
  readonly tokenSource?: string | undefined
  readonly apiKeySource?: string | undefined
  readonly apiProvider?: string | undefined
}

const CLOUD_PROVIDERS: Record<string, string> = {
  bedrock: "Amazon Bedrock",
  vertex: "Google Vertex AI",
  foundry: "Microsoft Foundry",
  anthropicAws: "Claude on AWS",
  anthropicGoogleCloud: "Claude on Google Cloud",
  mantle: "Mantle",
  gateway: "Enterprise gateway",
}

const PLANS: Record<string, string> = {
  free: "Claude Free",
  pro: "Claude Pro",
  max: "Claude Max",
  max5x: "Claude Max",
  max20x: "Claude Max",
  team: "Claude Team",
  enterprise: "Claude Enterprise",
}

/** Token sources that are really an API credential, not a claude.ai login. */
const API_TOKEN_SOURCES: Record<string, string> = {
  ANTHROPIC_AUTH_TOKEN: "Auth token from ANTHROPIC_AUTH_TOKEN",
  apiKey: "Anthropic API key",
  anthropicApiKey: "Anthropic API key",
  anthropicAuthToken: "Auth token from ANTHROPIC_AUTH_TOKEN",
}

const present = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "" && value !== "none"

/** "pro" → "Claude Pro"; an already readable label ("Claude Max") is kept. */
export const planLabel = (subscriptionType: string | undefined): string => {
  if (!present(subscriptionType)) return "Claude subscription"
  const trimmed = subscriptionType.trim()
  if (/^claude\b/i.test(trimmed)) return trimmed
  const known = PLANS[trimmed.toLowerCase()]
  if (known !== undefined) return known
  return `Claude ${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
}

export const apiKeyLabel = (apiKeySource: string): string => {
  switch (apiKeySource) {
    case "ANTHROPIC_API_KEY":
      return "API key from ANTHROPIC_API_KEY"
    case "apiKeyHelper":
      return "API key from apiKeyHelper"
    case "/login managed key":
      return "Anthropic Console key (claude auth login --console)"
    default:
      return `API key (${apiKeySource})`
  }
}

/**
 * Decides which credential Claude Code will actually use. Mirrors the CLI's
 * precedence: a third-party provider, then an API key (which wins over a stored
 * claude.ai login), then the subscription login.
 */
export const classifyAccount = (account: ReportedAccount | undefined): ClaudeConnection => {
  const email = present(account?.email) ? account.email : null
  const organization = present(account?.organization) ? account.organization : null

  if (account === undefined || Object.keys(account).length === 0) {
    return {
      _tag: "Unavailable",
      reason: "Claude Code started but did not report an account.",
    }
  }

  if (present(account.apiProvider) && account.apiProvider !== "firstParty") {
    return {
      _tag: "Connected",
      method: "cloudProvider",
      label: CLOUD_PROVIDERS[account.apiProvider] ?? account.apiProvider,
      email,
      organization,
      subscriptionShadowed: false,
    }
  }

  if (present(account.apiKeySource)) {
    return {
      _tag: "Connected",
      method: "apiKey",
      label: apiKeyLabel(account.apiKeySource),
      email,
      organization,
      // A token source next to an API key means a claude.ai login exists but is bypassed.
      subscriptionShadowed: present(account.tokenSource),
    }
  }

  if (present(account.tokenSource) && API_TOKEN_SOURCES[account.tokenSource] !== undefined) {
    return {
      _tag: "Connected",
      method: "apiKey",
      label: API_TOKEN_SOURCES[account.tokenSource] ?? account.tokenSource,
      email,
      organization,
      subscriptionShadowed: false,
    }
  }

  if (email !== null || present(account.subscriptionType) || present(account.tokenSource)) {
    return {
      _tag: "Connected",
      method: "subscription",
      label: planLabel(account.subscriptionType),
      email,
      organization,
      subscriptionShadowed: false,
    }
  }

  if (account.tokenSource === "none") return { _tag: "SignedOut" }

  return {
    _tag: "Unavailable",
    reason: "Claude Code started but did not say whether it is signed in.",
  }
}
