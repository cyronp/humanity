import type { AgentProvider } from "@humanity/contracts"
import { type Normalized, normalizeSdkMessage } from "./normalize.ts"
import { normalizeAcpEvent } from "./normalizeAcp.ts"
import { normalizeCodexEvent } from "./normalizeCodex.ts"

export interface ProviderTraits {
  readonly normalize: (raw: unknown) => Normalized
  readonly reportsCost: boolean
  readonly refusesPdfs: boolean
  readonly forksOwnThread: boolean
}

export const PROVIDER_TRAITS: Readonly<Record<AgentProvider, ProviderTraits>> = {
  "claude-code": {
    normalize: normalizeSdkMessage,
    reportsCost: true,
    refusesPdfs: false,
    forksOwnThread: false,
  },
  codex: {
    normalize: normalizeCodexEvent,
    reportsCost: false,
    refusesPdfs: true,
    forksOwnThread: true,
  },
  kiro: {
    normalize: normalizeAcpEvent,
    reportsCost: false,
    refusesPdfs: false,
    forksOwnThread: false,
  },
  antigravity: {
    normalize: normalizeAcpEvent,
    reportsCost: false,
    refusesPdfs: false,
    forksOwnThread: false,
  },
}
