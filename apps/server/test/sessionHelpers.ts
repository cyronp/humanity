import { assert } from "@effect/vitest"
import type { MessageContent, PlanUsage, SessionStatus } from "@humanity/contracts"
import { Effect, Layer, Stream } from "effect"
import { AgentRunnerFake, type FakeScript } from "../src/agent/AgentRunnerFake.ts"
import { ClaudeCode, ClaudeProbeFailed } from "../src/claude/ClaudeCode.ts"
import { ClaudeHistory, type TestConversation } from "../src/claude/ClaudeHistory.ts"
import { Services } from "../src/Daemon.ts"
import type { GitHubService } from "../src/services/GitHubService.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { baseLayer, tempDir, tempRepo } from "./helpers.ts"

/**
 * Session tests never reach Claude Code: the account check is never asked and
 * fails if it is, and the plan's usage is whatever `planUsage` scripts.
 */
const noClaude = (planUsage?: PlanUsageProbe) =>
  ClaudeCode.layerTest(
    Effect.fail(new ClaudeProbeFailed({ reason: "Claude Code is not used by session tests." })),
    planUsage === undefined ? {} : { planUsage },
  )

/** What an idle Claude Code reports about the plan when no agent is running. */
export type PlanUsageProbe = (
  configDir?: string,
) => Effect.Effect<PlanUsage | undefined, ClaudeProbeFailed>

/** A full set of services over `home`, with a scripted agent instead of the SDK. */
export const services = (
  home: string,
  script: FakeScript,
  claudeHistory: () => Readonly<Record<string, ReadonlyArray<TestConversation>>> = () => ({}),
  planUsage?: PlanUsageProbe,
  /** A GitHub to use instead of the offline one, for tests that follow pull requests. */
  github?: Layer.Layer<GitHubService>,
) =>
  Services.pipe(
    Layer.provideMerge(AgentRunnerFake(script)),
    Layer.provide(noClaude(planUsage)),
    Layer.provide(ClaudeHistory.layerTest(claudeHistory)),
    Layer.provideMerge(baseLayer(home, github)),
  )

/** Polls until `check` returns a value, failing the test after about four seconds. */
export const eventually = <A, E, R>(
  description: string,
  check: Effect.Effect<A | undefined, E, R>,
) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 400; attempt++) {
      const value = yield* check
      if (value !== undefined) return value
      yield* Effect.sleep("10 millis")
    }
    return assert.fail(`timed out waiting for ${description}`)
  })

export const waitForStatus = (sessionId: string, status: SessionStatus) =>
  eventually(
    `status ${status}`,
    SessionService.use((sessions) =>
      Effect.map(sessions.get(sessionId), (session) =>
        session.status === status ? session : undefined,
      ),
    ),
  )

/** The snapshot a new subscriber would get right now. */
export const contents = (sessionId: string) =>
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const snapshot = yield* sessions.subscribe(sessionId).pipe(Stream.take(1), Stream.runCollect)
    const first = snapshot[0]
    if (first?._tag !== "Snapshot") return assert.fail("expected a snapshot first")
    return first
  })

export const tags = (messages: ReadonlyArray<{ readonly content: MessageContent }>) =>
  messages.map((message) => message.content._tag)

export const setup = (files?: Record<string, string>) =>
  Effect.gen(function* () {
    const home = yield* tempDir()
    const repo = yield* tempRepo(files)
    return { home, repo }
  })

export const addProject = (repo: string) =>
  ProjectService.use((projects) => projects.addLocal(repo))
