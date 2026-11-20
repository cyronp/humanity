import { HumanityClient, keys } from "@/lib/rpc"

export const antigravityStatusAtom = HumanityClient.query(
  "Antigravity.status",
  { refresh: false },
  { reactivityKeys: [keys.antigravity] },
)

export const antigravityAccountsAtom = HumanityClient.query(
  "Antigravity.accounts",
  { refresh: false },
  { reactivityKeys: [keys.antigravity] },
)

export const refreshAntigravityAccountsAtom = HumanityClient.mutation("Antigravity.accounts")

export const addAntigravityAccountAtom = HumanityClient.mutation("Antigravity.addAccount")
export const removeAntigravityAccountAtom = HumanityClient.mutation("Antigravity.removeAccount")
export const setActiveAntigravityAccountAtom = HumanityClient.mutation(
  "Antigravity.setActiveAccount",
)
