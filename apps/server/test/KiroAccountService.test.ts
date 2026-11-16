import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { join } from "node:path"
import { AcpFailed } from "../src/acp/Connection.ts"
import type { ToolCallFields } from "../src/acp/protocol.ts"
import type { AcpProfile, AcpUpdate } from "../src/agent/AcpRunner.ts"
import {
  KIRO_ARGS,
  Kiro,
  type KiroProbe,
  kiroCliVersion,
  kiroModelsFromList,
  kiroProfile,
  kiroSignedIn,
} from "../src/kiro/Kiro.ts"
import { KiroAccountService, classifyKiroAccount } from "../src/services/KiroAccountService.ts"
import { baseLayer, tempDir } from "./helpers.ts"

const MODELS = [{ value: "claude-sonnet", displayName: "Claude Sonnet", description: "For tests" }]

/** A scripted Kiro: the default login is signed in, the folder of an added account is not. */
const scripted = (probed: Ref.Ref<ReadonlyArray<string | undefined>>) =>
  Kiro.layerTest({
    probe: (kiroHome) =>
      Effect.as(
        Ref.update(probed, (homes) => [...homes, kiroHome]),
        {
          cliVersion: "2.32.0",
          kiroHome: kiroHome ?? "/home/me/.kiro",
          signedIn: kiroHome === undefined,
          models: kiroHome === undefined ? MODELS : [],
        } satisfies KiroProbe,
      ),
  })

const layerOver = (home: string, probed: Ref.Ref<ReadonlyArray<string | undefined>>) =>
  KiroAccountService.layer.pipe(Layer.provide(scripted(probed)), Layer.provide(baseLayer(home)))

describe("Kiro (Beta)", () => {
  it("starts the CLI's ACP server on the V3 engine with CLI login, and no flag that trusts it", () => {
    assert.deepStrictEqual([...KIRO_ARGS], ["acp", "--agent-engine=v3", "--auth-method=cli"])
    assert.isFalse(KIRO_ARGS.some((arg) => arg.includes("autopilot") || arg.includes("trust")))
  })

  it("classifies a signed-in probe by its CLI version and a signed-out one as SignedOut", () => {
    assert.deepStrictEqual(
      classifyKiroAccount({ cliVersion: "2.32.0", kiroHome: "/k", signedIn: true, models: [] }),
      { _tag: "Connected", label: "Kiro CLI 2.32.0" },
    )
    assert.deepStrictEqual(
      classifyKiroAccount({ cliVersion: null, kiroHome: "/k", signedIn: true, models: [] }),
      { _tag: "Connected", label: "Kiro CLI" },
    )
    assert.deepStrictEqual(
      classifyKiroAccount({ cliVersion: null, kiroHome: "/k", signedIn: false, models: [] }),
      { _tag: "SignedOut" },
    )
  })

  it("reads the CLI's model list and nothing from an answer it cannot read", () => {
    const listed = JSON.stringify({
      models: [
        { model_id: "auto", model_name: "Auto" },
        { model_id: "claude-sonnet-5.5", model_name: "Claude Sonnet 5.5", description: "Balanced" },
        { model_id: "gpt-x" },
      ],
      default_model: "auto",
    })
    assert.deepStrictEqual(kiroModelsFromList(`${listed}\n`), [
      { value: "auto", displayName: "Auto", description: "" },
      { value: "claude-sonnet-5.5", displayName: "Claude Sonnet 5.5", description: "Balanced" },
      { value: "gpt-x", displayName: "gpt-x", description: "" },
    ])
    assert.deepStrictEqual(kiroModelsFromList("Opening the browser to sign in…"), [])
    assert.deepStrictEqual(kiroModelsFromList('{"models":"none"}'), [])
  })

  it("reads who is signed in from whoami, and says so when it cannot tell", () => {
    assert.isTrue(kiroSignedIn({ exitCode: 0, stdout: '{"accountType":"BuilderId"}\n' }))
    assert.isFalse(kiroSignedIn({ exitCode: 1, stdout: '{"account":null}\n' }))
    assert.isFalse(kiroSignedIn({ exitCode: 1, stdout: '{ "account": null }' }))
    assert.isUndefined(kiroSignedIn({ exitCode: 2, stdout: "error: unknown flag" }))
    assert.strictEqual(kiroCliVersion("kiro-cli 2.32.0\n"), "2.32.0")
    assert.isNull(kiroCliVersion("kiro"))
  })
})

/** What Kiro 2.32 writes, as its recorded sessions show it. */
describe("Kiro's own way with the protocol", () => {
  const CWD = process.platform === "win32" ? "C:\\work\\repo" : "/work/repo"
  const FILE = join(CWD, "notes.txt")
  const profileWith = (files: Record<string, string> = {}) => {
    const read: Array<string> = []
    const profile = kiroProfile((path) =>
      Effect.sync(() => {
        read.push(path)
        return files[path]
      }),
    )({ cwd: CWD })
    return { profile, read }
  }
  const write = (path: string, text: string): ToolCallFields => ({
    toolCallId: "tooluse_1",
    title: "Write File",
    kind: "edit",
    status: "in_progress",
    rawInput: { path, text },
    locations: [{ path }],
    _meta: { kiro: { preview: { file: path, modifiedContent: text }, toolOrigin: "default" } },
  })

  const nameOf = (profile: AcpProfile, call: ToolCallFields) =>
    profile.toolCall?.(call) ?? Effect.succeed(undefined)

  it("keeps Kiro supervised, and writes its model before Kiro lists it", () => {
    const { profile } = profileWith()
    assert.deepStrictEqual(profile.settings, [{ id: "autopilot", value: "off" }])
    assert.strictEqual(profile.lateModelOption, "model")
  })

  it.effect("names a write a file change before Kiro shows its diff", () =>
    Effect.gen(function* () {
      const fresh = profileWith()
      assert.deepStrictEqual(yield* nameOf(fresh.profile, write(FILE, "hello\n")), {
        toolName: "ApplyPatch",
        input: { changes: [{ path: FILE, kind: "add", diff: "hello\n" }] },
      })

      const existing = profileWith({ [FILE]: "a\nb\n" })
      assert.deepStrictEqual(yield* nameOf(existing.profile, write(FILE, "a\nc\n")), {
        toolName: "ApplyPatch",
        input: { changes: [{ path: FILE, kind: "update", diff: "@@ -1,2 +1,2 @@\n a\n-b\n+c" }] },
      })
    }),
  )

  it.effect("does not read a file outside the session's folder to show a change to it", () =>
    Effect.gen(function* () {
      const outside = process.platform === "win32" ? "C:\\Users\\me\\.bashrc" : "/home/me/.bashrc"
      const { profile, read } = profileWith({ [outside]: "secret" })
      const named = yield* nameOf(profile, write(outside, "x"))
      // Still a file change by its path, which is what gets it denied.
      assert.deepStrictEqual(named, {
        toolName: "ApplyPatch",
        input: { changes: [{ path: outside, kind: "add", diff: "x" }] },
      })
      assert.deepStrictEqual(read, [])
    }),
  )

  it.effect("leaves a call it cannot place, and one that shows its diff, to the protocol", () =>
    Effect.gen(function* () {
      const { profile } = profileWith()
      const shell: ToolCallFields = {
        toolCallId: "t",
        kind: "execute",
        rawInput: { command: "ls" },
      }
      assert.isUndefined(yield* nameOf(profile, shell))
      const shown: ToolCallFields = {
        ...write(FILE, "x"),
        content: [{ type: "diff", path: `file://${FILE}`, oldText: "", newText: "x" }],
      }
      assert.isUndefined(yield* nameOf(profile, shown))
    }),
  )

  it.effect("names an MCP call the way every agent's go by, from Kiro's title and server", () =>
    Effect.gen(function* () {
      const { profile } = profileWith()
      // As Kiro 2 announces a call of an HTTP MCP server it was given.
      const call: ToolCallFields = {
        toolCallId: "tooluse_l4S16",
        title: "@humanity/open_thread",
        kind: "other",
        status: "pending",
        rawInput: { prompt: "say hi", provider: "codex" },
        _meta: { kiro: { serverName: "humanity", toolOrigin: "default" } },
      }
      assert.deepStrictEqual(yield* nameOf(profile, call), {
        toolName: "mcp__humanity__open_thread",
        input: { prompt: "say hi", provider: "codex" },
      })
      // A title alone, or one that names another server, is not taken at its word.
      assert.isUndefined(yield* nameOf(profile, { ...call, _meta: undefined }))
      assert.isUndefined(
        yield* nameOf(profile, { ...call, _meta: { kiro: { serverName: "docs" } } }),
      )
      assert.isUndefined(yield* nameOf(profile, { ...call, title: "Tool Load" }))
    }),
  )

  it("knows the review of a turn's changes, and which calls it is about", () => {
    const { profile } = profileWith()
    const review = {
      sessionId: "s",
      toolCall: { toolCallId: "turn_approval_1", status: "pending", title: "Review changes" },
      options: [],
      _meta: {
        kiro: {
          type: "turn_approval",
          files: [{ path: FILE, toolCallId: "tooluse_1" }, { path: "/elsewhere" }],
        },
      },
    }
    assert.deepStrictEqual(profile.review?.(review), ["tooluse_1", ""])
    const tool = { ...review, _meta: { kiro: { toolId: "fs_write" } } }
    assert.isUndefined(profile.review?.(tool))
  })

  it("leaves out the cloud-config call, from its start to its end", () => {
    const { profile } = profileWith()
    const call = (fields: Record<string, unknown>): AcpUpdate => ({
      sessionUpdate: "tool_call_update",
      toolCallId: "cfg",
      ...fields,
    })
    assert.isUndefined(
      profile.update?.({
        sessionUpdate: "tool_call",
        toolCallId: "cfg",
        title: "Fetching your cloud config",
        _meta: { kiro: { toolId: "fetch_cloud_config" } },
      }),
    )
    assert.isUndefined(profile.update?.(call({ status: "completed" })))
    // Over: the id means nothing any more.
    assert.isDefined(profile.update?.(call({ status: "in_progress" })))
  })

  it("takes the steering note out of an answer, however it is cut into chunks", () => {
    const { profile } = profileWith()
    const info = (kind: string): AcpUpdate => ({
      sessionUpdate: "session_info_update",
      _meta: { kiro: { kind } },
    })
    const say = (text: string) => {
      const update = profile.update?.({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
      })
      return (update?.["content"] as { readonly text: string }).text
    }
    // Before a steer, text is not looked at.
    assert.strictEqual(say("[STEERING steer-1: kept]"), "[STEERING steer-1: kept]")
    profile.update?.(info("steering_injected"))
    const chunks = [
      "steering",
      " fixture observed\n\n[",
      "STEERING steer-f5f",
      "9d167: Updated",
      " response.]",
    ]
    assert.strictEqual(chunks.map(say).join(""), "steering fixture observed\n\n")
    assert.strictEqual(say(" More [text]."), " More [text].")
    profile.update?.(info("steering_cleared"))
  })

  it("places a sub-agent's updates, and tells when a turn has begun", () => {
    const { profile } = profileWith()
    const owner: AcpUpdate = {
      sessionUpdate: "tool_call",
      _meta: { kiro: { kind: "agent-subtask", agentSubtaskId: "sub-1" } },
    }
    const inner: AcpUpdate = {
      sessionUpdate: "agent_message_chunk",
      _meta: { kiro: { agentSubtaskId: "sub-1", replayId: "r" } },
    }
    assert.deepStrictEqual(profile.subtask?.(owner), { id: "sub-1", owner: true })
    assert.deepStrictEqual(profile.subtask?.(inner), { id: "sub-1", owner: false })
    assert.isUndefined(profile.subtask?.({ sessionUpdate: "agent_message_chunk" }))

    const begun = profile.cancelHold?.started
    assert.isTrue(
      begun?.({ sessionUpdate: "session_info_update", _meta: { kiro: { kind: "turn_start" } } }),
    )
    assert.isFalse(
      begun?.({ sessionUpdate: "session_info_update", _meta: { kiro: { kind: "focus_update" } } }),
    )
    assert.isTrue(begun?.({ sessionUpdate: "tool_call" }))
  })
})

describe("KiroAccountService", () => {
  it.effect("reports the default login with where it lives and what it offers", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const probed = yield* Ref.make<ReadonlyArray<string | undefined>>([])
      yield* Effect.gen(function* () {
        const service = yield* KiroAccountService
        const status = yield* service.status({ refresh: false })
        assert.deepStrictEqual(status.connection, { _tag: "Connected", label: "Kiro CLI 2.32.0" })
        assert.strictEqual(status.kiroHome, "/home/me/.kiro")
        assert.strictEqual(status.executable, "kiro-cli")
        assert.deepStrictEqual(status.models, MODELS)
        yield* service.status({ refresh: false })
        assert.strictEqual((yield* Ref.get(probed)).length, 1)
      }).pipe(Effect.provide(layerOver(home, probed)))
    }),
  )

  it.effect("turns a Kiro that cannot start into an Unavailable status, not a failure", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const layer = KiroAccountService.layer.pipe(
        Layer.provide(
          Kiro.layerTest({
            probe: () => Effect.fail(new AcpFailed({ reason: "kiro-cli was not found" })),
          }),
        ),
        Layer.provide(baseLayer(home)),
      )
      yield* Effect.gen(function* () {
        const status = yield* (yield* KiroAccountService).status({ refresh: false })
        assert.deepStrictEqual(status.connection, {
          _tag: "Unavailable",
          reason: "kiro-cli was not found",
        })
        assert.deepStrictEqual(status.models, [])
      }).pipe(Effect.provide(layer))
    }),
  )
})
