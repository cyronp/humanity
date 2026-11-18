import { HumanityClient, keys } from "@/lib/rpc"

export const codexStatusAtom = HumanityClient.query(
  "Codex.status",
  { refresh: false },
  { reactivityKeys: [keys.codex] },
)

export const codexAccountsAtom = HumanityClient.query(
  "Codex.accounts",
  { refresh: false },
  { reactivityKeys: [keys.codex] },
)

export const refreshCodexAccountsAtom = HumanityClient.mutation("Codex.accounts")

export const addCodexAccountAtom = HumanityClient.mutation("Codex.addAccount")
export const removeCodexAccountAtom = HumanityClient.mutation("Codex.removeAccount")
export const setActiveCodexAccountAtom = HumanityClient.mutation("Codex.setActiveAccount")
