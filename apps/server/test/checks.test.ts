import { assert, describe, it } from "@effect/vitest"
import { checksMessage, DEFAULT_PROJECT_SETTINGS } from "@humanity/contracts"
import { Effect } from "effect"
import { ProjectService } from "../src/services/ProjectService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { makeFakePtyHost } from "../src/terminal/PtyHost.ts"
import { addProject, services, setup, waitForStatus } from "./sessionHelpers.ts"

const osc = (payload: string) => `\x1b]${payload}\x07`

const fakeShell = () =>
  makeFakePtyHost({
    onSpawn: (pty) => void setTimeout(() => pty.print(`${osc("133;A")}$ `), 0),
    onWrite: (pty, data) => {
      if (!data.endsWith("\r")) return
      const command = data.slice(0, -1)
      const failing = command.includes("npm test")
      const output = failing ? "FAIL login.test.ts\r\nexpected 2, got 3\r\n" : "all good\r\n"
      pty.print(
        `${command}\r\n${osc("133;C")}${output}${osc(`133;D;${failing ? 1 : 0}`)}${osc("133;A")}$ `,
      )
    },
  })

describe("running a project's checks", () => {
  it.live("runs them in a terminal of the thread and reports how they ended", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const projects = yield* ProjectService
        const project = yield* addProject(repo)
        const thread = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(thread.id, "idle")

        const none = yield* Effect.flip(sessions.runChecks(thread.id))
        assert.strictEqual(none._tag, "ChecksUnavailable")
        assert.include(none.message, "Settings, under Projects")

        yield* projects.setSettings(project.id, {
          ...DEFAULT_PROJECT_SETTINGS,
          checkScript: "npm run lint\n\nnpm run typecheck\n",
        })
        const passed = yield* sessions.runChecks(thread.id)
        assert.strictEqual(passed.outcome, "passed")
        assert.strictEqual(passed.command, "npm run lint && npm run typecheck")
        assert.strictEqual(passed.exitCode, 0)

        yield* projects.setSettings(project.id, {
          ...DEFAULT_PROJECT_SETTINGS,
          checkScript: "npm run lint\nnpm test",
        })
        const failed = yield* sessions.runChecks(thread.id)
        assert.strictEqual(failed.outcome, "failed")
        assert.strictEqual(failed.exitCode, 1)
        assert.include(failed.output, "expected 2, got 3")
        assert.notMatch(failed.output, /\$\s*$/)
        assert.notStrictEqual(failed.terminalId, passed.terminalId)

        const message = checksMessage(failed)
        assert.include(message, "The checks failed (exit code 1): `npm run lint && npm test`")
        assert.include(message, "FAIL login.test.ts")
      }).pipe(
        Effect.provide(
          services(home, () => [], undefined, undefined, undefined, undefined, fakeShell().layer),
        ),
      )
    }),
  )
})
