import { RPC_PATH, TOKEN_PARAM } from "@humanity/contracts"

const STORAGE_KEY = "humanity.token"

/**
 * The daemon prints `http://127.0.0.1:7420/?token=...`. On first load the token
 * moves from the URL into localStorage, so it does not linger in the address
 * bar or the browser history.
 */
export const captureTokenFromUrl = (): void => {
  const url = new URL(window.location.href)
  const token = url.searchParams.get(TOKEN_PARAM)
  if (token === null) return
  storeToken(token)
  url.searchParams.delete(TOKEN_PARAM)
  window.history.replaceState(window.history.state, "", url)
}

export const readToken = (): string | undefined => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export const storeToken = (token: string): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, token.trim())
  } catch {
    // Private mode without storage: the token only lives for this page load.
  }
}

/** Accepts either the bare token or the whole URL the daemon printed. */
export const tokenFromInput = (input: string): string => {
  const trimmed = input.trim()
  try {
    return new URL(trimmed).searchParams.get(TOKEN_PARAM) ?? trimmed
  } catch {
    return trimmed
  }
}

/** WebSocket URL of the daemon's RPC endpoint, on the same origin as the page. */
export const rpcUrl = (): string => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const token = encodeURIComponent(readToken() ?? "")
  return `${protocol}//${window.location.host}${RPC_PATH}?${TOKEN_PARAM}=${token}`
}

export type AuthStatus = "ok" | "unauthorized" | "unreachable"

/** Tells a wrong token apart from a daemon that is not running, before opening the socket. */
export const checkAuth = async (token: string | undefined): Promise<AuthStatus> => {
  if (token === undefined || token === "") return "unauthorized"
  try {
    const response = await fetch("/api/auth", { headers: { authorization: `Bearer ${token}` } })
    if (response.ok) return "ok"
    return response.status === 401 ? "unauthorized" : "unreachable"
  } catch {
    return "unreachable"
  }
}
