import { HumanityClient, keys } from "@/lib/rpc"

/** The active Claude account: the one new threads run as (cached by the daemon for a short while). */
export const claudeStatusAtom = HumanityClient.query(
  "Claude.status",
  { refresh: false },
  { reactivityKeys: [keys.claude] },
)

/** Every Claude account with its status, the default login first. */
export const claudeAccountsAtom = HumanityClient.query(
  "Claude.accounts",
  { refresh: false },
  { reactivityKeys: [keys.claude] },
)

/** Same RPC as a mutation: asks again (with `refresh: true`, right away), then refreshes both queries. */
export const refreshClaudeAccountsAtom = HumanityClient.mutation("Claude.accounts")

export const addClaudeAccountAtom = HumanityClient.mutation("Claude.addAccount")
export const removeClaudeAccountAtom = HumanityClient.mutation("Claude.removeAccount")
export const setActiveClaudeAccountAtom = HumanityClient.mutation("Claude.setActiveAccount")
