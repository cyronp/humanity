import { HumanityClient, keys } from "@/lib/rpc"

export const claudeStatusAtom = HumanityClient.query(
  "Claude.status",
  { refresh: false },
  { reactivityKeys: [keys.claude] },
)

export const claudeAccountsAtom = HumanityClient.query(
  "Claude.accounts",
  { refresh: false },
  { reactivityKeys: [keys.claude] },
)

export const refreshClaudeAccountsAtom = HumanityClient.mutation("Claude.accounts")

export const addClaudeAccountAtom = HumanityClient.mutation("Claude.addAccount")
export const removeClaudeAccountAtom = HumanityClient.mutation("Claude.removeAccount")
export const setActiveClaudeAccountAtom = HumanityClient.mutation("Claude.setActiveAccount")
