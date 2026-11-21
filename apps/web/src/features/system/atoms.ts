import { HumanityClient, keys } from "@/lib/rpc"

export const systemInfoAtom = HumanityClient.query("System.info", undefined)

export const recordingsAtom = HumanityClient.query("System.recordings", undefined, {
  reactivityKeys: [keys.recordings],
})

export const openFolderAtom = HumanityClient.mutation("System.openFolder")

export const clearRecordingsAtom = HumanityClient.mutation("System.clearRecordings")

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"] as const
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
