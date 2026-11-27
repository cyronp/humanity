import { useCallback, useEffect, useState } from "react"

const COPIED_MS = 2000

export const copyToClipboard = async (text: string): Promise<string | undefined> => {
  try {
    await navigator.clipboard.writeText(text)
    return undefined
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause)
  }
}

export const useCopy = () => {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copied])
  const copy = useCallback(async (text: string) => {
    const failure = await copyToClipboard(text)
    setCopied(failure === undefined)
    return failure
  }, [])
  return { copied, copy }
}
