import { Cause, Predicate } from "effect"

/**
 * Turns whatever an RPC failed with into one sentence for the human. Tagged
 * errors from the contracts carry an actionable `message`; anything else is a
 * defect and is shown as such rather than swallowed.
 */
export const describeError = (error: unknown): string => {
  if (Predicate.isTagged(error, "RpcClientError")) {
    return "Lost the connection to the Humanity daemon. Check that it is still running."
  }
  if (error instanceof Error && error.message !== "") return error.message
  if (Predicate.hasProperty(error, "message") && Predicate.isString(error.message)) {
    return error.message
  }
  if (Predicate.hasProperty(error, "_tag") && Predicate.isString(error._tag)) return error._tag
  return typeof error === "string" ? error : "Unexpected error. See the daemon log for details."
}

export const describeCause = (cause: Cause.Cause<unknown>): string =>
  describeError(Cause.squash(cause))
