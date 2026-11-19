import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { PtyHost } from "../src/terminal/PtyHost.ts"

describe("PtyHost (node-pty)", () => {
  it.live(
    "runs a process in a real pseudo-terminal, passes input on and reports its exit code",
    () =>
      Effect.gen(function* () {
        const host = yield* PtyHost
        const pty = yield* host.spawn({
          file: process.execPath,
          args: [
            "-e",
            "process.stdin.once('data', (d) => { process.stdout.write('got ' + d.toString().trim()); setTimeout(() => process.exit(3), 50) })",
          ],
          cwd: process.cwd(),
          env: { ...(process.env as Record<string, string>) },
          cols: 80,
          rows: 24,
        })
        let output = ""
        pty.onData((data) => {
          output += data
        })
        const exitCode = yield* Effect.callback<number | null>((resume) => {
          pty.onExit((code) => resume(Effect.succeed(code)))
          setTimeout(() => pty.write("ping\r"), 500)
        })
        assert.include(output, "got ping")
        assert.strictEqual(exitCode, 3)
      }).pipe(Effect.provide(PtyHost.layer)),
    { timeout: 20_000 },
  )
})
