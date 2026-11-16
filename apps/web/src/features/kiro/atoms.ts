import { HumanityClient, keys } from "@/lib/rpc"

/** The active Kiro account, the one new threads run as, and the models it offers (cached by the daemon for a short while). */
export const kiroStatusAtom = HumanityClient.query(
  "Kiro.status",
  { refresh: false },
  { reactivityKeys: [keys.kiro] },
)

/** Every Kiro account with its status, the default login first. */
export const kiroAccountsAtom = HumanityClient.query(
  "Kiro.accounts",
  { refresh: false },
  { reactivityKeys: [keys.kiro] },
)

/** Same RPC as a mutation: asks again (with `refresh: true`, right away), then refreshes both queries. */
export const refreshKiroAccountsAtom = HumanityClient.mutation("Kiro.accounts")

export const addKiroAccountAtom = HumanityClient.mutation("Kiro.addAccount")
export const removeKiroAccountAtom = HumanityClient.mutation("Kiro.removeAccount")
export const setActiveKiroAccountAtom = HumanityClient.mutation("Kiro.setActiveAccount")
