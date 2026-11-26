import {
  type AgentProvider,
  CLI_COMMANDS,
  PROVIDER_NAMES,
  type ProviderStatus,
} from "@humanity/contracts"
import { callExecutable, isWindowsPath, quotePosix, quotePowerShell } from "@/lib/shell"

interface ProviderCopy {
  readonly account: string
  readonly plan: string | null
  readonly apiKey: string
  readonly login: string
  readonly homeVariable: string
  readonly loginVariables: ReadonlyArray<readonly [string, string]>
  readonly hint: string | null
  readonly wrongAccount: string | null
}

const COPY: Readonly<Record<AgentProvider, ProviderCopy>> = {
  "claude-code": {
    account: "Claude account",
    plan: "Claude",
    apiKey: "Anthropic API key",
    login: "auth login",
    homeVariable: "CLAUDE_CONFIG_DIR",
    loginVariables: [],
    hint: "Choose your Claude Pro, Max, Team or Enterprise account in the browser.",
    wrongAccount: "If it picks the wrong one, sign out of claude.ai first.",
  },
  codex: {
    account: "ChatGPT account",
    plan: "ChatGPT",
    apiKey: "OpenAI API key",
    login: "login",
    homeVariable: "CODEX_HOME",
    loginVariables: [],
    hint: "Sign in with a ChatGPT account whose plan includes Codex.",
    wrongAccount: "If it picks the wrong one, sign out of chatgpt.com first.",
  },
  kiro: {
    account: "Kiro account",
    plan: null,
    apiKey: "API key",
    login: "login",
    homeVariable: "KIRO_HOME",
    loginVariables: [],
    hint: null,
    wrongAccount: null,
  },
  antigravity: {
    account: "Google account",
    plan: null,
    apiKey: "API key",
    login: "acp --login",
    homeVariable: "GEMINI_HOME",
    loginVariables: [["AGY_ACP_FORCE_FILE_STORAGE", "1"]],
    hint: null,
    wrongAccount: null,
  },
}

export interface AccountSummary {
  readonly title: string
  readonly short: string
  readonly detail: string | null
}

export const summarizeAccount = (
  provider: AgentProvider,
  status: ProviderStatus,
): AccountSummary => {
  const copy = COPY[provider]
  const product = PROVIDER_NAMES[provider]
  const brand = copy.plan ?? product
  const connection = status.connection
  switch (connection._tag) {
    case "Connected": {
      if (connection.subscriptionShadowed) {
        return {
          title: `${brand} is using an API key instead of your subscription`,
          short: "API key in use",
          detail: null,
        }
      }
      if (connection.method === "plan") {
        return { title: `Connected to your ${copy.account}`, short: connection.label, detail: null }
      }
      const billed =
        copy.plan === null ? null : `Billed to this credential, not to a ${copy.plan} plan.`
      return connection.method === "apiKey"
        ? { title: `Connected with an ${copy.apiKey}`, short: "API key", detail: billed }
        : {
            title: `Connected through ${connection.label}`,
            short: connection.label,
            detail: billed,
          }
    }
    case "SignedOut":
      return { title: `${product} is not signed in`, short: `Sign in to ${brand}`, detail: null }
    case "Unavailable":
      return {
        title: `${product} could not be started`,
        short: `${brand} unavailable`,
        detail: null,
      }
  }
}

export const accountLine = (provider: AgentProvider, status: ProviderStatus): string => {
  const summary = summarizeAccount(provider, status)
  const connection = status.connection
  if (connection._tag !== "Connected") return summary.title
  return connection.email === null ? summary.short : `${summary.short} · ${connection.email}`
}

export interface AccountFact {
  readonly label: string
  readonly value: string
}

export const connectionFacts = (
  provider: AgentProvider,
  status: ProviderStatus,
): ReadonlyArray<AccountFact> => {
  const connection = status.connection
  if (connection._tag !== "Connected") return []
  return [
    ...(COPY[provider].plan === null
      ? []
      : [{ label: connection.method === "plan" ? "Plan" : "Credential", value: connection.label }]),
    ...(connection.email === null ? [] : [{ label: "Authenticated as", value: connection.email }]),
    ...(connection.organization === null
      ? []
      : [{ label: "Organization", value: connection.organization }]),
  ]
}

export interface SignIn {
  readonly home: string | null
  readonly executable: string | null
}

export const signInCommand = (provider: AgentProvider, { home, executable }: SignIn): string => {
  const copy = COPY[provider]
  const login = `${executable === null ? CLI_COMMANDS[provider] : callExecutable(executable)} ${copy.login}`
  if (home === null) return login
  const variables = [[copy.homeVariable, home] as const, ...copy.loginVariables]
  return isWindowsPath(home)
    ? `${variables.map(([name, value]) => `$env:${name} = ${quotePowerShell(value)}; `).join("")}${login}; Remove-Item ${variables.map(([name]) => `Env:${name}`).join(", ")}`
    : `${variables.map(([name, value]) => `${name}=${quotePosix(value)} `).join("")}${login}`
}

export const signInUsesPowerShell = ({ home, executable }: SignIn): boolean =>
  (executable !== null && isWindowsPath(executable)) || (home !== null && isWindowsPath(home))

export const signInHint = (provider: AgentProvider, isDefault: boolean): string | null => {
  const { hint, wrongAccount } = COPY[provider]
  if (hint === null) return null
  return isDefault || wrongAccount === null ? hint : `${hint} ${wrongAccount}`
}

export const homeVariable = (provider: AgentProvider): string => COPY[provider].homeVariable
