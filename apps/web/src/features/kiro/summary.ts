import type { KiroStatus } from "@humanity/contracts"

/** One line about a Kiro login: what the CLI says of it, or what is wrong. */
export const kiroLine = (status: KiroStatus): string => {
  const connection = status.connection
  switch (connection._tag) {
    case "Connected":
      return connection.label
    case "SignedOut":
      return "Kiro is not signed in"
    case "Unavailable":
      return "Kiro could not be started"
  }
}
