import { Effect, Stream } from "effect"
import type { ChildProcess, ChildProcessSpawner } from "effect/process"

export interface ProcessOutput {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

const collect = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  stream.pipe(Stream.decodeText(), Stream.mkString)

export const runProcess = (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  command: ChildProcess.Command,
) =>
  Effect.gen(function* () {
    const handle = yield* spawner.spawn(command)
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [collect(handle.stdout), collect(handle.stderr), handle.exitCode],
      { concurrency: "unbounded" },
    )
    return { stdout, stderr, exitCode: Number(exitCode) } satisfies ProcessOutput
  }).pipe(Effect.scoped)
