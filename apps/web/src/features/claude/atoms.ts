import { HumanityClient, keys } from "@/lib/rpc"

/** The Claude account agent sessions run as (cached by the daemon for a short while). */
export const claudeStatusAtom = HumanityClient.query(
  "Claude.status",
  { refresh: false },
  { reactivityKeys: [keys.claude] },
)

/** Same RPC with `refresh: true`: forces a new check, then refreshes `claudeStatusAtom`. */
export const refreshClaudeStatusAtom = HumanityClient.mutation("Claude.status")
