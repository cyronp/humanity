import { HumanityClient, keys } from "@/lib/rpc"

/** The Codex login and the models it offers (cached by the daemon for a short while). */
export const codexStatusAtom = HumanityClient.query(
  "Codex.status",
  { refresh: false },
  { reactivityKeys: [keys.codex] },
)

/** Same RPC as a mutation: asks again (with `refresh: true`, right away), then refreshes the query. */
export const refreshCodexStatusAtom = HumanityClient.mutation("Codex.status")
