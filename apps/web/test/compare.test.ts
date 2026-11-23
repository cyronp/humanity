import type { CompareRun, FileDiff, Session } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { compareRuns, runChanges, sharedFiles } from "@/features/compare/compare"

const file = (filePath: string, lines: ReadonlyArray<string>): FileDiff =>
  ({
    filePath,
    kind: "modify",
    binary: false,
    hunks: [{ index: 1, oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines }],
  }) as unknown as FileDiff

const run = (files: ReadonlyArray<FileDiff> | null): CompareRun => ({
  session: {} as Session,
  diff: files === null ? null : { base: "abc", files },
  amount: {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: null,
  },
  lastMessage: null,
})

describe("compare runs", () => {
  it("asks for one run per model, each with the same effort", () => {
    expect(
      compareRuns(
        { provider: "claude-code", model: null },
        [
          { provider: "codex", model: "gpt-9" },
          { provider: "claude-code", model: "opus", accountId: "work" },
        ],
        "high",
      ),
    ).toEqual([
      { provider: "claude-code", effort: "high" },
      { provider: "codex", model: "gpt-9", effort: "high" },
      { provider: "claude-code", model: "opus", effort: "high", accountId: "work" },
    ])
  })

  it("adds up a run's changes and finds the files more than one run changed", () => {
    const a = run([file("a.ts", ["-old", "+new", "+more"]), file("b.ts", ["+b"])])
    const b = run([file("a.ts", ["+x"])])
    expect(runChanges(a)).toEqual({ files: 2, added: 3, removed: 1 })
    expect(runChanges(run(null))).toBeUndefined()
    expect([...sharedFiles([a, b, run(null)])]).toEqual(["a.ts"])
  })
})
