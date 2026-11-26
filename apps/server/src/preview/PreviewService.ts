import {
  DEFAULT_DAEMON_PORT,
  DEFAULT_DESKTOP_PORT,
  type LocalServer,
  LocalServerNotFound,
  LocalServerStopFailed,
  type PreviewProbe,
  type TerminalId,
} from "@humanity/contracts"
import { Context, Effect, Layer, Schedule, Semaphore, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { ServerConfig } from "../ServerConfig.ts"
import { TerminalService } from "../terminal/TerminalService.ts"
import {
  ancestorIn,
  descendantsOf,
  framingOf,
  type Listener,
  parseLsof,
  parseNetstat,
  parseProcesses,
  parseSs,
  type ProcessRow,
  reachableLocally,
} from "./listeners.ts"
import { runProcess } from "../process.ts"

const SCAN_FAST = "2 seconds"
const SCAN_SLOW = "10 seconds"
const SCAN_FRESH_MS = 1_500
const HTTP_PROBE_MS = 800
const PAGE_PROBE_MS = 3_000
const STOP_GRACE_MS = 3_000

export interface CommandResult {
  readonly stdout: string
  readonly exitCode: number
}

export type RunCommand = (
  command: string,
  args: ReadonlyArray<string>,
) => Effect.Effect<CommandResult>

export type HttpCheck = (url: string) => Effect.Effect<boolean>

export interface PreviewServiceOptions {
  readonly platform?: NodeJS.Platform | undefined
  readonly run?: RunCommand | undefined
  readonly answersHttp?: HttpCheck | undefined
  readonly ownPorts?: () => ReadonlyArray<number>
}

const WINDOWS_PROCESSES =
  "Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, $_.Name }"

const fetchAnswers: HttpCheck = (url) =>
  Effect.tryPromise(async () => {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(HTTP_PROBE_MS),
    })
    await response.body?.cancel()
    return true
  }).pipe(Effect.orElseSucceed(() => false))

const probeHost = (host: string) =>
  host === "::1" || host === "::"
    ? "[::1]"
    : host === "*" || host === "0.0.0.0"
      ? "127.0.0.1"
      : host

const urlHost = (host: string) => (host === "::1" ? "[::1]" : "localhost")

export class PreviewService extends Context.Service<
  PreviewService,
  {
    readonly servers: (fast: boolean) => Stream.Stream<ReadonlyArray<LocalServer>>
    readonly scan: Effect.Effect<ReadonlyArray<LocalServer>>
    readonly stopServer: (
      pid: number,
      port: number,
    ) => Effect.Effect<void, LocalServerNotFound | LocalServerStopFailed>
    readonly probe: (url: string, embedder: string) => Effect.Effect<PreviewProbe>
  }
>()("humanity/PreviewService") {
  static readonly layer = (options: PreviewServiceOptions = {}) =>
    Layer.effect(
      PreviewService,
      Effect.gen(function* () {
        const config = yield* ServerConfig
        const terminals = yield* TerminalService
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
        const platform = options.platform ?? process.platform

        const run: RunCommand =
          options.run ??
          ((command, args) =>
            runProcess(spawner, ChildProcess.make(command, args, { extendEnv: true })).pipe(
              Effect.map(({ stdout, exitCode }) => ({ stdout, exitCode })),
              Effect.orElseSucceed(() => ({ stdout: "", exitCode: -1 })),
            ))
        const answersHttp = options.answersHttp ?? fetchAnswers

        const listListeners: Effect.Effect<ReadonlyArray<Listener>> =
          platform === "win32"
            ? Effect.map(
                Effect.all([
                  run("netstat", ["-ano", "-p", "TCP"]),
                  run("netstat", ["-ano", "-p", "TCPv6"]),
                ]),
                ([v4, v6]) => [...parseNetstat(v4.stdout), ...parseNetstat(v6.stdout)],
              )
            : platform === "linux"
              ? Effect.map(run("ss", ["-ltnpH"]), (result) => parseSs(result.stdout))
              : Effect.map(run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"]), (result) =>
                  parseLsof(result.stdout),
                )

        const listProcesses: Effect.Effect<ReadonlyArray<ProcessRow>> = Effect.map(
          platform === "win32"
            ? run("powershell.exe", [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                WINDOWS_PROCESSES,
              ])
            : run("ps", ["-A", "-o", "pid=,ppid=,comm="]),
          (result) => parseProcesses(result.stdout),
        )

        let processes: ReadonlyArray<ProcessRow> = []
        let parents = new Map<number, number>()
        let names = new Map<number, string>()
        const answers = new Map<string, boolean>()
        let last: ReadonlyArray<LocalServer> = []
        let lastAt = 0
        const lock = yield* Semaphore.make(1)

        const refreshProcesses = Effect.gen(function* () {
          processes = yield* listProcesses
          parents = new Map(processes.map((row) => [row.pid, row.ppid]))
          names = new Map(processes.map((row) => [row.pid, row.name]))
        })

        const ownPorts = () =>
          new Set([
            config.port,
            DEFAULT_DAEMON_PORT,
            DEFAULT_DESKTOP_PORT,
            ...(options.ownPorts?.() ?? []),
          ])

        const scanNow = Effect.gen(function* () {
          const own = ownPorts()
          const byPort = new Map<number, Listener>()
          for (const listener of yield* listListeners) {
            if (!reachableLocally(listener.host) || own.has(listener.port)) continue
            if (listener.pid === process.pid || listener.pid <= 4) continue
            if (!byPort.has(listener.port)) byPort.set(listener.port, listener)
          }
          const listeners = [...byPort.values()]
          if (listeners.some((listener) => !parents.has(listener.pid))) yield* refreshProcesses

          const keys = new Set(listeners.map((listener) => `${listener.pid}:${listener.port}`))
          for (const key of [...answers.keys()]) if (!keys.has(key)) answers.delete(key)
          yield* Effect.forEach(
            listeners.filter((listener) => !answers.has(`${listener.pid}:${listener.port}`)),
            (listener) =>
              Effect.map(
                answersHttp(`http://${probeHost(listener.host)}:${listener.port}/`),
                (answered) => void answers.set(`${listener.pid}:${listener.port}`, answered),
              ),
            { concurrency: "unbounded", discard: true },
          )

          const shells = yield* terminals.processIds
          const servers = listeners
            .filter((listener) => answers.get(`${listener.pid}:${listener.port}`) === true)
            .map((listener): LocalServer => ({
              port: listener.port,
              url: `http://${urlHost(listener.host)}:${listener.port}/`,
              pid: listener.pid,
              processName: listener.processName ?? names.get(listener.pid) ?? null,
              terminalId: ancestorIn<TerminalId>(listener.pid, parents, shells) ?? null,
            }))
            .sort(
              (a, b) =>
                Number(a.terminalId === null) - Number(b.terminalId === null) || a.port - b.port,
            )
          last = servers
          lastAt = Date.now()
          return servers
        })

        const scan = Semaphore.withPermit(lock)(
          Effect.suspend(() =>
            Date.now() - lastAt < SCAN_FRESH_MS ? Effect.succeed(last) : scanNow,
          ),
        )

        const servers = (fast: boolean) =>
          Stream.fromEffectSchedule(scan, Schedule.spaced(fast ? SCAN_FAST : SCAN_SLOW)).pipe(
            Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
          )

        const stopServer = (pid: number, port: number) =>
          Effect.gen(function* () {
            const listed = last.find((server) => server.pid === pid && server.port === port)
            if (listed === undefined || pid === process.pid || pid === process.ppid) {
              return yield* new LocalServerNotFound({ pid, port })
            }
            if (platform === "win32") {
              const result = yield* run("taskkill", ["/PID", String(pid), "/T", "/F"])
              if (result.exitCode !== 0) {
                return yield* new LocalServerStopFailed({
                  port,
                  reason: result.stdout.trim() || `taskkill exited with ${result.exitCode}`,
                })
              }
            } else {
              yield* refreshProcesses
              const tree = descendantsOf(pid, processes)
              const signal = (name: NodeJS.Signals) =>
                tree.filter((each) => {
                  try {
                    process.kill(each, name)
                    return true
                  } catch {
                    return false
                  }
                })
              if (signal("SIGTERM").length === 0) {
                return yield* new LocalServerStopFailed({ port, reason: "the process is gone." })
              }
              yield* Effect.sleep(STOP_GRACE_MS).pipe(
                Effect.andThen(Effect.sync(() => signal("SIGKILL"))),
                Effect.forkDetach,
              )
            }
            last = last.filter((server) => server.pid !== pid)
            lastAt = 0
          })

        const probe = (url: string, embedder: string): Effect.Effect<PreviewProbe> =>
          Effect.gen(function* () {
            let target: URL
            try {
              target = new URL(url)
            } catch {
              return { _tag: "Unreachable", reason: `"${url}" is not an address.` } as const
            }
            const hostname = target.hostname.replace(/^\[|\]$/g, "")
            const port = Number(target.port || (target.protocol === "https:" ? 443 : 80))
            if (!reachableLocally(hostname) && hostname !== "localhost") {
              return { _tag: "Unreachable", reason: "Only local addresses are checked." } as const
            }
            if (ownPorts().has(port)) {
              return { _tag: "Refuses", reason: "This is Humanity's own port." } as const
            }
            return yield* Effect.tryPromise(async (): Promise<PreviewProbe> => {
              const response = await fetch(target, { signal: AbortSignal.timeout(PAGE_PROBE_MS) })
              await response.body?.cancel()
              const refusal = framingOf(response.headers, embedder)
              return refusal === undefined
                ? { _tag: "Ok", status: response.status }
                : { _tag: "Refuses", reason: refusal }
            }).pipe(
              Effect.orElseSucceed((): PreviewProbe => ({
                _tag: "Unreachable",
                reason: `Nothing answers on port ${port}. Is the server running?`,
              })),
            )
          })

        return PreviewService.of({ servers, scan, stopServer, probe })
      }),
    )
}
