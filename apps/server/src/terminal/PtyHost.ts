import { Context, Data, Effect, Layer } from "effect"
import type * as NodePty from "node-pty"

export interface PtySpawnOptions {
  readonly file: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly cols: number
  readonly rows: number
}

/** A running pseudo-terminal. Callbacks run on Node's event loop, outside any fiber. */
export interface PtyProcess {
  readonly pid: number
  readonly write: (data: string) => void
  readonly resize: (cols: number, rows: number) => void
  readonly kill: () => void
  readonly onData: (listener: (data: string) => void) => void
  readonly onExit: (listener: (exitCode: number | null) => void) => void
}

export class PtySpawnError extends Data.TaggedError("PtySpawnError")<{ readonly reason: string }> {}

export class PtyHost extends Context.Service<
  PtyHost,
  {
    readonly spawn: (options: PtySpawnOptions) => Effect.Effect<PtyProcess, PtySpawnError>
  }
>()("humanity/PtyHost") {
  /** node-pty, loaded on first use so the daemon starts even where its binary is missing. */
  static readonly layer = Layer.sync(PtyHost, () => {
    let loaded: Promise<typeof NodePty> | undefined
    const load = () => (loaded ??= import("node-pty"))
    return PtyHost.of({
      spawn: (options) =>
        Effect.tryPromise({
          try: async () => {
            const pty = await load()
            const child = pty.spawn(options.file, [...options.args], {
              name: "xterm-256color",
              cols: options.cols,
              rows: options.rows,
              cwd: options.cwd,
              env: { ...options.env },
              ...(process.platform === "win32" ? { useConptyDll: true } : {}),
            })
            return {
              pid: child.pid,
              write: (data) => child.write(data),
              resize: (cols, rows) => {
                try {
                  child.resize(cols, rows)
                } catch {
                  // A process that just exited cannot be resized; its exit is reported anyway.
                }
              },
              kill: () => {
                try {
                  child.kill()
                } catch {
                  // Already gone.
                }
              },
              onData: (listener) => void child.onData(listener),
              onExit: (listener) =>
                void child.onExit(({ exitCode }) =>
                  listener(Number.isFinite(exitCode) ? exitCode : null),
                ),
            } satisfies PtyProcess
          },
          catch: (cause) =>
            new PtySpawnError({ reason: cause instanceof Error ? cause.message : String(cause) }),
        }),
    })
  })
}

/** A scripted pty for tests: what is written to it is recorded, and the test makes it print. */
export interface FakePty extends PtyProcess {
  readonly options: PtySpawnOptions
  readonly written: Array<string>
  readonly sizes: Array<readonly [number, number]>
  readonly killed: boolean
  readonly print: (data: string) => void
  readonly exit: (exitCode: number | null) => void
}

export const makeFakePtyHost = (
  options: {
    /** Runs on each spawn, e.g. to print a prompt or fail. */
    readonly onSpawn?: (pty: FakePty) => void
    readonly fail?: (options: PtySpawnOptions) => string | undefined
  } = {},
) => {
  const spawned: Array<FakePty> = []
  const layer = Layer.succeed(
    PtyHost,
    PtyHost.of({
      spawn: (spawnOptions) =>
        Effect.suspend(() => {
          const failure = options.fail?.(spawnOptions)
          if (failure !== undefined) return Effect.fail(new PtySpawnError({ reason: failure }))
          const dataListeners: Array<(data: string) => void> = []
          const exitListeners: Array<(exitCode: number | null) => void> = []
          let exited = false
          const pty: FakePty = {
            pid: 1000 + spawned.length,
            options: spawnOptions,
            written: [],
            sizes: [],
            get killed() {
              return exited
            },
            write: (data) => void pty.written.push(data),
            resize: (cols, rows) => void pty.sizes.push([cols, rows]),
            kill: () => pty.exit(null),
            onData: (listener) => void dataListeners.push(listener),
            onExit: (listener) => void exitListeners.push(listener),
            print: (data) => {
              if (!exited) for (const listener of dataListeners) listener(data)
            },
            exit: (exitCode) => {
              if (exited) return
              exited = true
              for (const listener of exitListeners) listener(exitCode)
            },
          }
          spawned.push(pty)
          options.onSpawn?.(pty)
          return Effect.succeed(pty)
        }),
    }),
  )
  return { layer, spawned }
}
