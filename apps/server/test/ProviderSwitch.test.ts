import { assert, describe, it } from "@effect/vitest"
import { HUMANITY_MCP_SERVER, THREAD_HISTORY_TOOL_NAME } from "@humanity/contracts"
import { Effect, Ref } from "effect"
import { FakeAgentLog } from "../src/agent/AgentRunnerFake.ts"
import { estimateTokens } from "../src/agent/handoff.ts"
import { Kiro } from "../src/kiro/Kiro.ts"
import { answerMcp, HumanityMcp } from "../src/mcp/HumanityMcp.ts"
import { SessionRepo } from "../src/db/SessionRepo.ts"
import { SessionService } from "../src/services/SessionService.ts"
import {
  addProject,
  contents,
  eventually,
  services,
  setup,
  waitForStatus,
} from "./sessionHelpers.ts"

const signedInKiro = Kiro.layerTest({
  probe: () =>
    Effect.succeed({
      cliVersion: "3.0.0",
      kiroHome: "/home/me/.kiro",
      signedIn: true,
      models: [
        { value: "auto", displayName: "Auto", description: "" },
        { value: "claude-sonnet-5.5", displayName: "Claude Sonnet 5.5", description: "" },
      ],
    }),
})

const signedOutKiro = Kiro.layerTest({
  probe: () =>
    Effect.succeed({
      cliVersion: "3.0.0",
      kiroHome: "/home/me/.kiro",
      signedIn: false,
      models: [],
    }),
})

const sentTexts = Effect.flatMap(FakeAgentLog, (log) =>
  Effect.map(Ref.get(log.sent), (sent) => sent.map((message) => message.text)),
)

describe("moving a thread to another provider", () => {
  it.live(
    "hands the conversation to the new provider once, and offers it the thread's history",
    () =>
      Effect.gen(function* () {
        const { home, repo } = yield* setup()
        yield* Effect.gen(function* () {
          const sessions = yield* SessionService
          const sessionRepo = yield* SessionRepo
          const log = yield* FakeAgentLog
          const mcp = yield* HumanityMcp
          const project = yield* addProject(repo)
          const created = yield* sessions.create({
            projectId: project.id,
            prompt: "Fix the login bug",
          })
          yield* waitForStatus(created.id, "idle")

          const moved = yield* sessions.switchProvider(created.id, "kiro", "Sonnet 5.5")
          assert.strictEqual(moved.provider, "kiro")
          assert.strictEqual(moved.model, "claude-sonnet-5.5")
          assert.isNull(moved.sdkSessionId)
          const divider = (yield* contents(created.id)).messages.at(-1)?.content
          const pending = (yield* sessionRepo.getPendingHandoff(created.id)) ?? ""
          assert.deepStrictEqual(divider, {
            _tag: "provider_switch",
            from: "claude-code",
            to: "kiro",
            model: "claude-sonnet-5.5",
            resumed: false,
            included: 2,
            omitted: 0,
            tokens: estimateTokens(pending),
          })
          assert.isAbove(estimateTokens(pending), 0)

          yield* sessions.sendMessage(created.id, "Now add a test")
          const run = yield* eventually(
            "the Kiro run",
            Effect.map(Ref.get(log.runs), (runs) => runs[1]),
          )
          assert.strictEqual(run.provider, "kiro")
          assert.isUndefined(run.resume)
          const sent = (yield* sentTexts)[1] ?? ""
          assert.match(sent, /^<humanity-handoff>\n\[Humanity\] This thread ran on Claude Code/)
          assert.include(sent, "#1 Human: Fix the login bug")
          assert.include(sent, "#2 Agent (Claude Code): Looked at it.")
          assert.match(sent, /<\/humanity-handoff>\n\nNow add a test$/)
          assert.isNotNull(yield* sessionRepo.getPendingHandoff(created.id))

          const server = run.extensions.mcpServers[HUMANITY_MCP_SERVER]
          const tools = mcp.toolsFor(
            server?.type === "http" ? server.headers["Authorization"] : undefined,
          )
          assert.isDefined(tools?.history)
          const reply = yield* answerMcp(tools ?? {}, {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: THREAD_HISTORY_TOOL_NAME, arguments: { from: 1, to: 1 } },
          })
          const text = (reply.body as { result: { content: Array<{ text: string }> } }).result
            .content[0]?.text
          assert.strictEqual(text, "Entries #1–#1 of 4.\n\n#1 Human: Fix the login bug")
        }).pipe(
          Effect.provide(
            services(
              home,
              () => [{ text: "Looked at it." }],
              undefined,
              undefined,
              undefined,
              signedInKiro,
            ),
          ),
        )
      }),
  )

  it.live("an agent that comes back resumes its own conversation and hears what it missed", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const created = yield* sessions.create({ projectId: project.id, prompt: "Start here" })
        yield* waitForStatus(created.id, "idle")

        yield* sessions.switchProvider(created.id, "kiro", null)
        yield* sessions.sendMessage(created.id, "Kiro, do the second part")
        yield* eventually(
          "the Kiro run",
          Effect.map(Ref.get(log.runs), (runs) => runs[1]),
        )
        yield* sessions.interrupt(created.id)

        const back = yield* sessions.switchProvider(created.id, "claude-code", null)
        assert.strictEqual(back.provider, "claude-code")
        assert.strictEqual(back.sdkSessionId, "fake-sdk-session-1")
        const divider = (yield* contents(created.id)).messages.at(-1)?.content
        assert.strictEqual(divider?._tag, "provider_switch")
        assert.isTrue(divider?._tag === "provider_switch" && divider.resumed)

        yield* sessions.sendMessage(created.id, "Claude, wrap it up")
        yield* waitForStatus(created.id, "idle")
        const runs = yield* Ref.get(log.runs)
        assert.strictEqual(runs[2]?.provider, "claude-code")
        assert.strictEqual(runs[2]?.resume, "fake-sdk-session-1")
        const sent = (yield* sentTexts)[2] ?? ""
        assert.include(sent, "You are back in this thread on Claude Code")
        assert.include(sent, "Human: Kiro, do the second part")
        assert.notInclude(sent, "#1 Human: Start here")

        yield* sessions.sendMessage(created.id, "One more thing")
        yield* waitForStatus(created.id, "idle")
        assert.strictEqual((yield* sentTexts)[3], "One more thing")
      }).pipe(
        Effect.provide(
          services(home, () => [{ text: "ok" }], undefined, undefined, undefined, signedInKiro),
        ),
      )
    }),
  )

  it.live("waits for the agent to be idle, and for the provider to be signed in", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const working = yield* sessions.create({ projectId: project.id, prompt: "Go" })
        yield* waitForStatus(working.id, "running")
        const busy = yield* Effect.flip(sessions.switchProvider(working.id, "kiro", null))
        assert.strictEqual(busy._tag, "ProviderSwitchUnavailable")
        assert.include(busy.message, "still working")
        yield* sessions.interrupt(working.id)

        const signedOut = yield* Effect.flip(sessions.switchProvider(working.id, "kiro", null))
        assert.strictEqual(signedOut._tag, "ProviderSwitchUnavailable")
        assert.include(signedOut.message, "Nobody is signed in to Kiro")
        assert.strictEqual((yield* sessions.get(working.id)).provider, "claude-code")
      }).pipe(
        Effect.provide(
          services(home, () => [{ hang: true }], undefined, undefined, undefined, signedOutKiro),
        ),
      )
    }),
  )
})
