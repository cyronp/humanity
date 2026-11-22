import { type AgentCli, PROVIDER_NAMES, type SystemInfo } from "@humanity/contracts"

export const diagnosticsText = (options: {
  readonly appVersion: string | undefined
  readonly info: SystemInfo | undefined
  readonly clis: ReadonlyArray<AgentCli>
  readonly userAgent: string
}): string => {
  const { appVersion, info, clis, userAgent } = options
  const lines = [`Humanity ${appVersion ?? "unknown"}`]
  if (info !== undefined) {
    lines.push(
      `OS: ${info.platform} ${info.osRelease} (${info.arch})`,
      `Node: ${info.nodeVersion}`,
      ...(info.electronVersion === null ? [] : [`Electron: ${info.electronVersion}`]),
      `Daemon port: ${info.port}`,
    )
  }
  for (const cli of clis) {
    const name = PROVIDER_NAMES[cli.provider]
    lines.push(
      cli.path === null
        ? `${name}: not installed`
        : `${name}: ${cli.version ?? "unknown version"}${cli.outdated ? " (older than tested)" : ""}`,
    )
  }
  lines.push(`Browser: ${userAgent}`)
  return lines.join("\n")
}
