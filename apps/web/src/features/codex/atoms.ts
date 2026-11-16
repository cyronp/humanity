import { HumanityClient, keys } from "@/lib/rpc"

/** The active Codex account, the one new threads run as, and the models it offers (cached by the daemon for a short while). */
export const codexStatusAtom = HumanityClient.query(
  "Codex.status",
  { refresh: false },
  { reactivityKeys: [keys.codex] },
)

/** Every Codex account with its status, the default login first. */
export const codexAccountsAtom = HumanityClient.query(
  "Codex.accounts",
  { refresh: false },
  { reactivityKeys: [keys.codex] },
)

/** Same RPC as a mutation: asks again (with `refresh: true`, right away), then refreshes both queries. */
export const refreshCodexAccountsAtom = HumanityClient.mutation("Codex.accounts")

export const addCodexAccountAtom = HumanityClient.mutation("Codex.addAccount")
export const removeCodexAccountAtom = HumanityClient.mutation("Codex.removeAccount")
export const setActiveCodexAccountAtom = HumanityClient.mutation("Codex.setActiveAccount")
