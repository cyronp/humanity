import { HumanityClient, keys } from "@/lib/rpc"

export const kiroStatusAtom = HumanityClient.query(
  "Kiro.status",
  { refresh: false },
  { reactivityKeys: [keys.kiro] },
)

export const kiroAccountsAtom = HumanityClient.query(
  "Kiro.accounts",
  { refresh: false },
  { reactivityKeys: [keys.kiro] },
)

export const refreshKiroAccountsAtom = HumanityClient.mutation("Kiro.accounts")

export const addKiroAccountAtom = HumanityClient.mutation("Kiro.addAccount")
export const removeKiroAccountAtom = HumanityClient.mutation("Kiro.removeAccount")
export const setActiveKiroAccountAtom = HumanityClient.mutation("Kiro.setActiveAccount")
