import type { UpdateState } from "@humanity/contracts"

export const describeUpdate = (state: UpdateState, formatTime: (iso: string) => string): string => {
  switch (state._tag) {
    case "Unsupported":
      return state.reason
    case "Idle":
      return "Not checked yet."
    case "Checking":
      return "Looking for a new version…"
    case "UpToDate":
      return `Up to date. Checked at ${formatTime(state.checkedAt)}.`
    case "Available":
      return `Version ${state.version} is ready. Installing restarts Humanity.`
    case "Downloading":
      return `Downloading version ${state.version}: ${Math.floor(state.percent)}%.`
    case "Installing":
      return `Restarting into version ${state.version}…`
    case "Failed":
      return `Update failed: ${state.message}`
  }
}

export const isUpdating = (state: UpdateState): boolean =>
  state._tag === "Downloading" || state._tag === "Installing"
