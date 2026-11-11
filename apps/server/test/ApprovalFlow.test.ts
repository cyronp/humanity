import { assert, describe, it } from "@effect/vitest"
import {
  type Approval,
  type Autonomy,
  ChangeId,
  ConfirmationId,
  type PendingConfirmation,
  type ProposedChange,
  setToolRule,
} from "@humanity/contracts"
import {
  applyHunks,
  formatPartialApplicationMessage,
  formatRejectionMessage,
  withDecisions,
} from "@humanity/diff"
import { Effect, Ref } from "effect"
import { SqlClient } from "effect/sql"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { FakeAgentLog, type FakeScript } from "../src/agent/AgentRunnerFake.ts"
import { ApprovalService } from "../src/services/ApprovalService.ts"
import { PolicyService } from "../src/services/PolicyService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { git } from "./helpers.ts"
import {
  addProject,
  contents,
  eventually,
  services,
  setup,
  waitForStatus,
} from "./sessionHelpers.ts"

const lines = (count: number) => Array.from({ length: count }, (_, i) => `line ${i + 1}`)
const text = (rows: ReadonlyArray<string>) => rows.map((row) => `${row}\n`).join("")

/** A 40-line file and a Write that changes it in three far-apart places: three hunks. */
const ORIGINAL = text(lines(40))
const PROPOSED = (() => {
  const rows = lines(40)
  rows[2] = "CHANGED 3"
  rows[19] = "CHANGED 20"
  rows[36] = "CHANGED 37"
  return text(rows)
})()

const writeScript: FakeScript = (_prompt, turn) =>
  turn === 1
    ? [
        { tool: "Write", input: { file_path: "data.txt", content: PROPOSED } },
        { text: "Proposed three changes." },
      ]
    : [{ text: "OK." }]

/** Starts a session whose agent immediately asks for a review, and waits for it. */
const startWithPendingChange = (script: FakeScript = writeScript) =>
  Effect.gen(function* () {
    const { home, repo } = yield* setup({ "data.txt": ORIGINAL })
    return { home, repo, script }
  })

const pendingChange = (sessionId: string) =>
  eventually(
    "a pending change",
    Effect.map(contents(sessionId), (snapshot) => {
      const found = snapshot.approvals.find(
        (approval): approval is Extract<Approval, { _tag: "change" }> =>
          approval._tag === "change" && approval.change.status === "pending",
      )
      return found?.change
    }),
  )

const pendingConfirmation = (sessionId: string) =>
  eventually(
    "a pending confirmation",
    Effect.map(contents(sessionId), (snapshot) => {
      const found = snapshot.approvals.find(
        (approval): approval is Extract<Approval, { _tag: "confirmation" }> =>
          approval._tag === "confirmation" && approval.confirmation.status === "pending",
      )
      return found?.confirmation
    }),
  )

const decisionFor = (toolName: string) =>
  Effect.gen(function* () {
    const log = yield* FakeAgentLog
    return yield* eventually(
      `the permission decision for ${toolName}`,
      Effect.map(Ref.get(log.permissions), (entries) =>
        entries.find((entry) => entry.toolName === toolName),
      ),
    )
  })

const createSession = (repo: string, prompt = "Make the changes") =>
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const project = yield* addProject(repo)
    const session = yield* sessions.create({ projectId: project.id, prompt })
    return { project, session }
  })

describe("review flow", () => {
  it.live("blocks the agent until every hunk is decided, then lets the SDK apply it", () =>
    Effect.gen(function* () {
      const { home, repo, script } = yield* startWithPendingChange()

      yield* Effect.gen(function* () {
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)

        const change = yield* pendingChange(session.id)
        yield* waitForStatus(session.id, "waiting_for_human")
        assert.strictEqual(change.filePath, "data.txt")
        assert.strictEqual(change.kind, "modify")
        assert.deepStrictEqual(
          change.hunks.map((hunk) => [hunk.index, hunk.status]),
          [
            [1, "pending"],
            [2, "pending"],
            [3, "pending"],
          ],
        )
        // Nothing has touched the file while the human is deciding.
        yield* Effect.sleep("100 millis")
        const file = join(session.worktreePath, "data.txt")
        assert.strictEqual(readFileSync(file, "utf8"), ORIGINAL)

        const resolved = yield* approvals.decideChange(
          change.id,
          [1, 2, 3].map((index) => ({ index, decision: "approved" as const })),
        )
        assert.strictEqual(resolved.status, "applied")

        assert.deepStrictEqual((yield* decisionFor("Write")).decision, { behavior: "allow" })
        yield* waitForStatus(session.id, "idle")
        assert.strictEqual(readFileSync(file, "utf8"), PROPOSED)
        const snapshot = yield* contents(session.id)
        assert.strictEqual(snapshot.toolCalls[0]?.status, "succeeded")
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("applies only the approved hunks and tells the agent exactly what happened", () =>
    Effect.gen(function* () {
      const { home, repo, script } = yield* startWithPendingChange()

      yield* Effect.gen(function* () {
        const approvals = yield* ApprovalService
        const sql = yield* SqlClient.SqlClient
        const { session } = yield* createSession(repo)
        const change = yield* pendingChange(session.id)

        const decisions = [
          { index: 1, decision: "approved" as const },
          {
            index: 2,
            decision: "rejected" as const,
            comment: "Keep the old validation, it's used by the CLI",
          },
          { index: 3, decision: "approved" as const },
        ]
        const resolved = yield* approvals.decideChange(change.id, decisions)
        assert.strictEqual(resolved.status, "partially_applied")

        const decided = withDecisions(change.hunks, decisions)
        const expectedContent = applyHunks(ORIGINAL, change.hunks, [1, 3])
        const file = join(session.worktreePath, "data.txt")
        assert.strictEqual(readFileSync(file, "utf8"), expectedContent)
        assert.include(expectedContent, "CHANGED 3\n")
        assert.include(expectedContent, "line 20\n")
        assert.include(expectedContent, "CHANGED 37\n")

        const { decision } = yield* decisionFor("Write")
        assert.deepStrictEqual(decision, {
          behavior: "deny",
          message: formatPartialApplicationMessage("data.txt", decided),
        })
        assert.strictEqual(
          decision !== "interrupted" && decision.behavior === "deny" ? decision.message : "",
          [
            "PARTIALLY APPLIED by the human reviewer to data.txt.",
            'Applied: hunks 1, 3. Rejected: hunk 2 — "Keep the old validation, it\'s used by the CLI".',
            "The file on disk now differs from what you proposed. Re-read it before making further edits.",
          ].join("\n"),
        )

        // The SDK reports the denial; the fake must not have written the full proposal.
        yield* waitForStatus(session.id, "idle")
        assert.strictEqual(readFileSync(file, "utf8"), expectedContent)

        const rows = yield* sql<{
          hunk_index: number
          decision: string
          comment: string | null
        }>`SELECT hunk_index, decision, comment FROM hunk_decisions ORDER BY hunk_index`
        assert.deepStrictEqual(
          rows.map((row) => [row.hunk_index, row.decision, row.comment]),
          [
            [1, "approved", null],
            [2, "rejected", "Keep the old validation, it's used by the CLI"],
            [3, "approved", null],
          ],
        )
        const stored = (yield* contents(session.id)).approvals.find(
          (approval) => approval._tag === "change",
        )
        assert.strictEqual(
          stored?._tag === "change" ? stored.change.hunks[1]?.comment : undefined,
          "Keep the old validation, it's used by the CLI",
        )
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("rejecting every hunk leaves the file alone and returns the comments", () =>
    Effect.gen(function* () {
      const { home, repo, script } = yield* startWithPendingChange()

      yield* Effect.gen(function* () {
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)
        const change = yield* pendingChange(session.id)

        const decisions = [
          { index: 1, decision: "rejected" as const, comment: "No." },
          { index: 2, decision: "rejected" as const },
          { index: 3, decision: "rejected" as const, comment: "Not this either." },
        ]
        const resolved = yield* approvals.decideChange(change.id, decisions)
        assert.strictEqual(resolved.status, "rejected")

        const { decision } = yield* decisionFor("Write")
        assert.deepStrictEqual(decision, {
          behavior: "deny",
          message: formatRejectionMessage("data.txt", withDecisions(change.hunks, decisions)),
        })
        yield* waitForStatus(session.id, "idle")
        assert.strictEqual(readFileSync(join(session.worktreePath, "data.txt"), "utf8"), ORIGINAL)
        const snapshot = yield* contents(session.id)
        assert.strictEqual(snapshot.toolCalls[0]?.status, "denied")
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("requires a decision for every hunk and accepts only one verdict", () =>
    Effect.gen(function* () {
      const { home, repo, script } = yield* startWithPendingChange()

      yield* Effect.gen(function* () {
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)
        const change = yield* pendingChange(session.id)

        const incomplete = yield* Effect.flip(
          approvals.decideChange(change.id, [{ index: 2, decision: "approved" }]),
        )
        assert.strictEqual(incomplete._tag, "IncompleteReview")
        assert.deepStrictEqual(
          incomplete._tag === "IncompleteReview" ? incomplete.missing : [],
          [1, 3],
        )

        const all = [1, 2, 3].map((index) => ({ index, decision: "approved" as const }))
        yield* approvals.decideChange(change.id, all)
        const twice = yield* Effect.flip(approvals.decideChange(change.id, all))
        assert.strictEqual(twice._tag, "ApprovalAlreadyDecided")

        const unknown = yield* Effect.flip(approvals.decideChange(ChangeId.make("nope"), all))
        assert.strictEqual(unknown._tag, "ApprovalNotFound")
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("an interrupt releases the agent, expires the request and writes nothing", () =>
    Effect.gen(function* () {
      const { home, repo, script } = yield* startWithPendingChange()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)
        const change = yield* pendingChange(session.id)

        yield* sessions.interrupt(session.id)
        const { decision } = yield* decisionFor("Write")
        assert.strictEqual(decision, "interrupted")

        const expired = yield* eventually(
          "the change to expire",
          Effect.map(contents(session.id), (snapshot) => {
            const found = snapshot.approvals[0]
            return found?._tag === "change" && found.change.status === "expired" ? found : undefined
          }),
        )
        assert.strictEqual(expired._tag, "change")
        assert.strictEqual(readFileSync(join(session.worktreePath, "data.txt"), "utf8"), ORIGINAL)
        assert.strictEqual((yield* sessions.get(session.id)).status, "interrupted")

        const late = yield* Effect.flip(
          approvals.decideChange(
            change.id,
            [1, 2, 3].map((index) => ({ index, decision: "approved" as const })),
          ),
        )
        assert.strictEqual(late._tag, "ApprovalAlreadyDecided")
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("creates new files through review", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const script: FakeScript = () => [
        {
          tool: "Write",
          input: { file_path: "src/new.ts", content: "export const created = 1\n" },
        },
      ]

      yield* Effect.gen(function* () {
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)
        const change = yield* pendingChange(session.id)
        assert.strictEqual(change.kind, "create")
        assert.strictEqual(change.filePath, "src/new.ts")
        assert.strictEqual(change.originalContent, "")
        assert.isFalse(existsSync(join(session.worktreePath, "src/new.ts")))

        yield* approvals.decideChange(change.id, [{ index: 1, decision: "approved" }])
        yield* waitForStatus(session.id, "idle")
        assert.strictEqual(
          readFileSync(join(session.worktreePath, "src/new.ts"), "utf8"),
          "export const created = 1\n",
        )
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("an Edit becomes hunks from the file's current content", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "app.ts": "const a = 1\nconst b = 2\n" })
      const script: FakeScript = () => [
        {
          tool: "Edit",
          input: { file_path: "app.ts", old_string: "const b = 2", new_string: "const b = 3" },
        },
      ]

      yield* Effect.gen(function* () {
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)
        const change = yield* pendingChange(session.id)
        assert.deepStrictEqual(change.hunks[0]?.lines, [
          " const a = 1",
          "-const b = 2",
          "+const b = 3",
        ])
        assert.strictEqual(change.proposedContent, "const a = 1\nconst b = 3\n")

        yield* approvals.decideChange(change.id, [{ index: 1, decision: "approved" }])
        yield* waitForStatus(session.id, "idle")
        assert.strictEqual(
          readFileSync(join(session.worktreePath, "app.ts"), "utf8"),
          "const a = 1\nconst b = 3\n",
        )
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("denies at once, without asking, edits that cannot be reviewed", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "app.ts": "const a = 1\n" })
      const outside = join(home, "outside.txt")
      const script: FakeScript = () => [
        { tool: "Write", input: { file_path: outside, content: "escape" } },
        { tool: "Write", input: { file_path: "../../escape.txt", content: "escape" } },
        { tool: "Edit", input: { file_path: "app.ts", old_string: "missing", new_string: "x" } },
        { tool: "Write", input: { file_path: "app.ts", content: "const a = 1\n" } },
        { text: "Done." },
      ]

      yield* Effect.gen(function* () {
        const log = yield* FakeAgentLog
        const { session } = yield* createSession(repo)
        yield* waitForStatus(session.id, "idle")

        const messages = (yield* Ref.get(log.permissions)).map((entry) =>
          entry.decision !== "interrupted" && entry.decision.behavior === "deny"
            ? entry.decision.message
            : "allowed",
        )
        assert.lengthOf(messages, 4)
        assert.match(messages[0] ?? "", /outside this session's worktree/)
        assert.match(messages[1] ?? "", /outside this session's worktree/)
        assert.match(messages[2] ?? "", /old_string was not found/)
        assert.match(messages[3] ?? "", /unchanged/)
        assert.isFalse(existsSync(outside))
        assert.deepStrictEqual((yield* contents(session.id)).approvals, [])
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("a file changed during review is not partially overwritten", () =>
    Effect.gen(function* () {
      const { home, repo, script } = yield* startWithPendingChange()

      yield* Effect.gen(function* () {
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)
        const change = yield* pendingChange(session.id)
        const file = join(session.worktreePath, "data.txt")
        writeFileSync(file, "edited by the human meanwhile\n")

        const resolved = yield* approvals.decideChange(change.id, [
          { index: 1, decision: "approved" },
          { index: 2, decision: "rejected" },
          { index: 3, decision: "approved" },
        ])
        assert.strictEqual(resolved.status, "rejected")
        assert.strictEqual(readFileSync(file, "utf8"), "edited by the human meanwhile\n")
        const { decision } = yield* decisionFor("Write")
        assert.match(
          decision !== "interrupted" && decision.behavior === "deny" ? decision.message : "",
          /^NOT APPLIED: data\.txt changed on disk/,
        )
      }).pipe(Effect.provide(services(home, script)))
    }),
  )
})

describe("confirm flow", () => {
  const bashScript: FakeScript = (_prompt, turn) => [
    {
      tool: "Bash",
      input: { command: `echo ${turn}`, description: "Print a number" },
      output: `${turn}`,
    },
    { text: "Ran it." },
  ]

  it.live("runs a confirmed command and records who allowed it", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)
        const confirmation = yield* pendingConfirmation(session.id)
        yield* waitForStatus(session.id, "waiting_for_human")
        assert.strictEqual(confirmation.toolName, "Bash")
        assert.deepStrictEqual(confirmation.input, {
          command: "echo 1",
          description: "Print a number",
        })

        const resolved = yield* approvals.decideConfirmation(confirmation.id, { decision: "allow" })
        assert.strictEqual(resolved.status, "allowed")
        yield* waitForStatus(session.id, "idle")
        const snapshot = yield* contents(session.id)
        assert.strictEqual(snapshot.toolCalls[0]?.status, "succeeded")
        assert.strictEqual(snapshot.toolCalls[0]?.output?.content, "1")
      }).pipe(Effect.provide(services(home, bashScript)))
    }),
  )

  it.live("returns the human's comment as the denial", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)
        const confirmation = yield* pendingConfirmation(session.id)

        yield* approvals.decideConfirmation(confirmation.id, {
          decision: "deny",
          comment: "  Use the test script instead.  ",
        })
        const { decision } = yield* decisionFor("Bash")
        assert.deepStrictEqual(decision, {
          behavior: "deny",
          message: "DENIED by the human reviewer: Use the test script instead.",
        })
        yield* waitForStatus(session.id, "idle")
        const stored = (yield* contents(session.id)).approvals[0]
        assert.strictEqual(
          stored?._tag === "confirmation" ? stored.confirmation.comment : undefined,
          "Use the test script instead.",
        )
      }).pipe(Effect.provide(services(home, bashScript)))
    }),
  )

  it.live("'always allow' updates the policy so the next call runs without asking", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const approvals = yield* ApprovalService
        const policies = yield* PolicyService
        const log = yield* FakeAgentLog
        const { project, session } = yield* createSession(repo)
        const confirmation = yield* pendingConfirmation(session.id)

        yield* approvals.decideConfirmation(confirmation.id, {
          decision: "allow",
          alwaysAllow: true,
        })
        yield* waitForStatus(session.id, "idle")
        assert.strictEqual(policies.modeFor(project.id, "Bash"), "auto")

        yield* sessions.sendMessage(session.id, "again")
        yield* waitForStatus(session.id, "idle")
        // The running agent still asks canUseTool, which now allows it without a human.
        const asked = yield* Ref.get(log.permissions)
        assert.deepStrictEqual(asked[1]?.decision, { behavior: "allow" })
        const snapshot = yield* contents(session.id)
        assert.lengthOf(snapshot.approvals, 1)
        assert.deepStrictEqual(
          snapshot.toolCalls.map((call) => call.status),
          ["succeeded", "succeeded"],
        )
      }).pipe(Effect.provide(services(home, bashScript)))
    }),
  )

  it.live("tools without a simulator, like NotebookEdit, fall back to a confirmation", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const script: FakeScript = () => [
        { tool: "NotebookEdit", input: { notebook_path: "a.ipynb", new_source: "print(1)" } },
      ]

      yield* Effect.gen(function* () {
        const { session } = yield* createSession(repo)
        const confirmation = yield* pendingConfirmation(session.id)
        assert.strictEqual(confirmation.toolName, "NotebookEdit")
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("a policy tightened mid-session applies to the very next call", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const script: FakeScript = () => [
        { tool: "Read", input: { file_path: "README.md" }, output: "# fixture" },
      ]

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const policies = yield* PolicyService
        const { project, session } = yield* createSession(repo, "read it")
        yield* waitForStatus(session.id, "idle")
        assert.lengthOf((yield* contents(session.id)).approvals, 0)

        const policy = yield* policies.get(project.id)
        yield* policies.set(project.id, {
          rules: policy.rules.map((rule) =>
            rule.pattern === "Read" ? { pattern: "Read", mode: "confirm" as const } : rule,
          ),
        })
        yield* sessions.sendMessage(session.id, "read it again")
        const confirmation = yield* pendingConfirmation(session.id)
        assert.strictEqual(confirmation.toolName, "Read")
      }).pipe(Effect.provide(services(home, script)))
    }),
  )
})

describe("autonomy", () => {
  const bashScript: FakeScript = () => [
    { tool: "Bash", input: { command: "echo 1", description: "Print a number" }, output: "1" },
    { text: "Ran it." },
  ]

  const createWith = (repo: string, autonomy: Autonomy, prompt = "Make the changes") =>
    Effect.gen(function* () {
      const sessions = yield* SessionService
      const project = yield* addProject(repo)
      const session = yield* sessions.create({ projectId: project.id, prompt, autonomy })
      return { project, session }
    })

  it.live("accept_edits applies an edit inside the worktree without a review", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "data.txt": ORIGINAL })

      yield* Effect.gen(function* () {
        const { session } = yield* createWith(repo, "accept_edits")
        assert.strictEqual(session.autonomy, "accept_edits")
        yield* waitForStatus(session.id, "idle")
        assert.deepStrictEqual((yield* decisionFor("Write")).decision, { behavior: "allow" })
        const file = join(session.worktreePath, "data.txt")
        assert.strictEqual(readFileSync(file, "utf8"), PROPOSED)
        assert.lengthOf((yield* contents(session.id)).approvals, 0)
      }).pipe(Effect.provide(services(home, writeScript)))
    }),
  )

  it.live("accept_edits still denies a file outside the worktree", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const outside = join(home, "outside.txt")
      const script: FakeScript = () => [
        { tool: "Write", input: { file_path: outside, content: "nope\n" } },
        { tool: "NotebookEdit", input: { notebook_path: join(home, "a.ipynb"), new_source: "1" } },
      ]

      yield* Effect.gen(function* () {
        const log = yield* FakeAgentLog
        const { session } = yield* createWith(repo, "accept_edits")
        yield* waitForStatus(session.id, "idle")
        const asked = yield* Ref.get(log.permissions)
        for (const entry of asked) {
          assert.strictEqual(
            entry.decision === "interrupted" ? undefined : entry.decision.behavior,
            "deny",
          )
        }
        assert.lengthOf(asked, 2)
        assert.isFalse(existsSync(outside))
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("accept_edits still asks before a command; auto runs it", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const { session } = yield* createWith(repo, "accept_edits")
        const confirmation = yield* pendingConfirmation(session.id)
        assert.strictEqual(confirmation.toolName, "Bash")
      }).pipe(Effect.provide(services(home, bashScript)))

      const second = yield* setup()
      yield* Effect.gen(function* () {
        const { session } = yield* createWith(second.repo, "auto")
        yield* waitForStatus(session.id, "idle")
        assert.deepStrictEqual((yield* decisionFor("Bash")).decision, { behavior: "allow" })
        assert.lengthOf((yield* contents(session.id)).approvals, 0)
      }).pipe(Effect.provide(services(second.home, bashScript)))
    }),
  )

  it.live("auto never overrides a deny rule", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const policies = yield* PolicyService
        const project = yield* addProject(repo)
        const policy = yield* policies.get(project.id)
        yield* policies.set(project.id, setToolRule(policy, "Bash", "deny"))
        const sessions = yield* SessionService
        const session = yield* sessions.create({
          projectId: project.id,
          prompt: "run it",
          autonomy: "auto",
        })
        yield* waitForStatus(session.id, "idle")
        const snapshot = yield* contents(session.id)
        assert.strictEqual(snapshot.toolCalls[0]?.status, "denied")
        assert.lengthOf(snapshot.approvals, 0)
      }).pipe(Effect.provide(services(home, bashScript)))
    }),
  )

  it.live("a change of autonomy mid-session applies to the very next call", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const approvals = yield* ApprovalService
        const { session } = yield* createWith(repo, "ask")
        const confirmation = yield* pendingConfirmation(session.id)
        yield* approvals.decideConfirmation(confirmation.id, { decision: "allow" })
        yield* waitForStatus(session.id, "idle")

        const before = yield* sessions.get(session.id)
        const updated = yield* sessions.setAutonomy(session.id, "auto")
        assert.strictEqual(updated.autonomy, "auto")
        // The sidebar counts from `updatedAt`; a change of autonomy is not a change of status.
        assert.strictEqual(updated.updatedAt, before.updatedAt)

        yield* sessions.sendMessage(session.id, "again")
        yield* waitForStatus(session.id, "idle")
        assert.lengthOf((yield* contents(session.id)).approvals, 1)
      }).pipe(Effect.provide(services(home, bashScript)))
    }),
  )

  it.live("an ended session's autonomy cannot change", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id })
        assert.strictEqual(session.autonomy, "ask")
        yield* sessions.end(session.id, { removeWorktree: false })
        const result = yield* sessions.setAutonomy(session.id, "auto").pipe(Effect.flip)
        assert.strictEqual(result._tag, "SessionEnded")
      }).pipe(Effect.provide(services(home, bashScript)))
    }),
  )
})

describe("restart", () => {
  it.live("pending approvals expire when the daemon restarts", () =>
    Effect.gen(function* () {
      const { home, repo, script } = yield* startWithPendingChange()

      const sessionId = yield* Effect.gen(function* () {
        const { session } = yield* createSession(repo)
        yield* pendingChange(session.id)
        return session.id
      }).pipe(Effect.provide(services(home, script)))

      yield* Effect.gen(function* () {
        const snapshot = yield* contents(sessionId)
        const approval = snapshot.approvals[0]
        assert.strictEqual(approval?._tag === "change" ? approval.change.status : "", "expired")
        assert.strictEqual(snapshot.session.status, "interrupted")

        const approvals = yield* ApprovalService
        const late = yield* Effect.flip(
          approvals.decideConfirmation(ConfirmationId.make("missing"), { decision: "allow" }),
        )
        assert.strictEqual(late._tag, "ApprovalNotFound")
      }).pipe(Effect.provide(services(home, script)))
    }),
  )
})

// Type-only guards: the snapshot exposes both approval shapes.
export type _Shapes = [ProposedChange, PendingConfirmation]

describe("committing approved work", () => {
  it.live("commits the approved changes to the session branch, never the user's checkout", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "app.ts": "const a = 1\n" })
      const script: FakeScript = (_prompt, turn) =>
        turn === 1
          ? [
              {
                tool: "Edit",
                input: { file_path: "app.ts", old_string: "a = 1", new_string: "a = 2" },
              },
              { text: "Changed." },
            ]
          : [{ hang: true }]

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const approvals = yield* ApprovalService
        const { session } = yield* createSession(repo)

        const nothingYet = yield* Effect.flip(sessions.commit(session.id, "too early"))
        assert.strictEqual(nothingYet._tag, "SessionBusy")

        const change = yield* pendingChange(session.id)
        yield* approvals.decideChange(change.id, [{ index: 1, decision: "approved" }])
        yield* waitForStatus(session.id, "idle")

        const preview = yield* sessions.diff(session.id)
        assert.deepStrictEqual(
          preview.files.map((file) => file.filePath),
          ["app.ts"],
        )

        const hash = yield* sessions.commit(session.id, "Bump a to 2\n\nApproved in Humanity.")
        assert.match(hash, /^[0-9a-f]{7,}$/)
        assert.strictEqual(
          git(session.worktreePath, "log", "-1", "--format=%s").trim(),
          "Bump a to 2",
        )
        assert.strictEqual(git(session.worktreePath, "status", "--porcelain").trim(), "")
        // The user's checkout and its branch are untouched.
        assert.strictEqual(git(repo, "log", "-1", "--format=%s", "main").trim(), "initial")
        assert.strictEqual(readFileSync(join(repo, "app.ts"), "utf8"), "const a = 1\n")

        const empty = yield* Effect.flip(sessions.commit(session.id, "again"))
        assert.strictEqual(empty._tag, "NothingToCommit")

        const snapshot = yield* contents(session.id)
        const notice = snapshot.messages.at(-1)?.content
        assert.match(notice?._tag === "notice" ? notice.text : "", new RegExp(`^Committed ${hash}`))

        // Busy again: a commit must wait for the agent.
        yield* sessions.sendMessage(session.id, "keep going")
        yield* waitForStatus(session.id, "running")
        const busy = yield* Effect.flip(sessions.commit(session.id, "mid-turn"))
        assert.strictEqual(busy._tag, "SessionBusy")
      }).pipe(Effect.provide(services(home, script)))
    }),
  )
})
