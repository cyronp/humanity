import { RPC_PATH, TOKEN_PARAM } from "@humanity/contracts"

const STORAGE_KEY = "humanity.token"

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
  } catch {}
}

export const tokenFromInput = (input: string): string => {
  const trimmed = input.trim()
  try {
    return new URL(trimmed).searchParams.get(TOKEN_PARAM) ?? trimmed
  } catch {
    return trimmed
  }
}

export const rpcUrl = (): string => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const token = encodeURIComponent(readToken() ?? "")
  return `${protocol}//${window.location.host}${RPC_PATH}?${TOKEN_PARAM}=${token}`
}

export type AuthStatus = "ok" | "missing" | "rejected" | "unreachable"

export const checkAuth = async (token: string | undefined): Promise<AuthStatus> => {
  if (token === undefined || token === "") return "missing"
  try {
    const response = await fetch("/api/auth", { headers: { authorization: `Bearer ${token}` } })
    if (response.ok) return "ok"
    return response.status === 401 ? "rejected" : "unreachable"
  } catch {
    return "unreachable"
  }
}
