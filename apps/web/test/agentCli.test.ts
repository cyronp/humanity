import type { AgentCli } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { cliProblem, updateOutcome } from "@/features/providers/cli"

const cli = (fields: Partial<AgentCli> = {}): AgentCli => ({
  provider: "codex",
  path: "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd",
  version: "0.169.0",
  minimumVersion: "0.169.0",
  outdated: false,
  updateCommand: "codex update",
  installUrl: "https://github.com/openai/codex",
  ...fields,
})

describe("what Humanity says about a CLI", () => {
  it("says nothing about one that is installed and recent enough", () => {
    expect(cliProblem(cli())).toBeUndefined()
    expect(cliProblem(cli({ version: null }))).toBeUndefined()
  })

  it("says when it is not installed", () => {
    expect(cliProblem(cli({ path: null, version: null }))).toBe(
      "Codex is not installed on this computer.",
    )
  })

  it("asks to update one older than Humanity is tested with", () => {
    expect(cliProblem(cli({ version: "0.155.1", outdated: true }))).toBe(
      "Codex 0.155.1 is older than Humanity is tested with (0.169.0 or later). Threads may not work properly until it is updated.",
    )
  })

  it("tells what an update did", () => {
    expect(updateOutcome("0.155.1", cli({ version: "0.170.0" }))).toBe(
      "Codex was updated to 0.170.0.",
    )
    expect(updateOutcome("0.169.0", cli())).toBe("Codex 0.169.0 is already the latest version.")
    expect(updateOutcome(null, cli({ version: null }))).toBe("Codex was updated.")
  })
})
