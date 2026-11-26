import type { AgentProvider } from "@humanity/contracts"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

export const providerStatusAtom = Atom.family((provider: AgentProvider) =>
  HumanityClient.query(
    "Providers.status",
    { provider, refresh: false },
    { reactivityKeys: [keys.provider(provider)] },
  ),
)

export const providerAccountsAtom = Atom.family((provider: AgentProvider) =>
  HumanityClient.query(
    "Providers.accounts",
    { provider, refresh: false },
    { reactivityKeys: [keys.provider(provider)] },
  ),
)

export const refreshProviderAccountsAtom = HumanityClient.mutation("Providers.accounts")
export const addProviderAccountAtom = HumanityClient.mutation("Providers.addAccount")
export const removeProviderAccountAtom = HumanityClient.mutation("Providers.removeAccount")
export const setActiveProviderAccountAtom = HumanityClient.mutation("Providers.setActiveAccount")
