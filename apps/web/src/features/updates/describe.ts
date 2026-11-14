import type { UpdateState } from "@humanity/contracts"

/** One line on where the desktop app's updates stand. `formatTime` renders an ISO time. */
export const describeUpdate = (state: UpdateState, formatTime: (iso: string) => string): string => {
  switch (state._tag) {
    case "Unsupported":
      return state.reason
    case "Idle":
      return "Not checked since the app started."
    case "Checking":
      return "Looking for a new version…"
    case "UpToDate":
      return `Humanity is up to date. Checked at ${formatTime(state.checkedAt)}.`
    case "Available":
      return `Version ${state.version} is ready to install. Humanity restarts to finish.`
    case "Downloading":
      return `Downloading version ${state.version}: ${Math.floor(state.percent)}%.`
    case "Installing":
      return `Restarting into version ${state.version}…`
    case "Failed":
      return `The last attempt failed: ${state.message}`
  }
}

/** True while the desktop app is downloading or installing, when nothing else can start. */
export const isUpdating = (state: UpdateState): boolean =>
  state._tag === "Downloading" || state._tag === "Installing"
