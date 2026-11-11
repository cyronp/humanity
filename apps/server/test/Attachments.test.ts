import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeAgentLog } from "../src/agent/AgentRunnerFake.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { addProject, contents, services, setup, waitForStatus } from "./sessionHelpers.ts"

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const PDF = Buffer.from("%PDF-1.7\n%fake\n")
const NOTES = Buffer.from("\uFEFFline one\nline two\n")
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0xff, 0xfe])

const upload = (name: string, bytes: Buffer) => ({ name, data: bytes.toString("base64") })

describe("attachments", () => {
  it.live("stores the files, shows them in the transcript and sends them to the agent", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const session = yield* sessions.create({
          projectId: project.id,
          prompt: "What is in these?",
          attachments: [
            upload("C:\\Users\\me\\screen.png", PNG),
            upload("spec.pdf", PDF),
            upload("notes.md", NOTES),
          ],
        })
        yield* waitForStatus(session.id, "idle")

        const first = (yield* contents(session.id)).messages[0]?.content
        if (first?._tag !== "user") return assert.fail("expected the human's message first")
        assert.strictEqual(first.text, "What is in these?")
        assert.deepStrictEqual(
          first.attachments?.map(({ name, kind, mediaType, size }) => [
            name,
            kind,
            mediaType,
            size,
          ]),
          [
            // Only the base name of a path is kept.
            ["screen.png", "image", "image/png", PNG.length],
            ["spec.pdf", "pdf", "application/pdf", PDF.length],
            ["notes.md", "text", "text/plain", NOTES.length],
          ],
        )

        const sent = (yield* Ref.get(log.sent))[0]
        assert.strictEqual(sent?.text, "What is in these?")
        assert.deepStrictEqual(sent?.attachments, [
          {
            kind: "image",
            name: "screen.png",
            mediaType: "image/png",
            base64: PNG.toString("base64"),
          },
          { kind: "pdf", name: "spec.pdf", base64: PDF.toString("base64") },
          { kind: "text", name: "notes.md", text: "line one\nline two\n" },
        ])

        // The bytes live under the data directory and come back unchanged.
        const image = first.attachments?.[0]
        if (image === undefined) return assert.fail("expected the image")
        const stored = join(home, "attachments", session.id, image.id)
        assert.deepStrictEqual(readFileSync(stored), PNG)
        const content = yield* sessions.attachment(session.id, image.id)
        assert.deepStrictEqual(content, {
          name: "screen.png",
          mediaType: "image/png",
          data: PNG.toString("base64"),
        })
      }).pipe(Effect.provide(services(home, () => [{ text: "A screenshot, a spec and notes." }])))
    }),
  )

  it.live("refuses a file it cannot send before anything is created", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const refused = yield* sessions
          .create({
            projectId: project.id,
            prompt: "Read this",
            attachments: [upload("report.docx", ZIP)],
          })
          .pipe(Effect.flip)
        assert.strictEqual(refused._tag, "AttachmentRejected")
        assert.match(refused.message, /^report\.docx: Only images/)
        assert.lengthOf(yield* sessions.list(project.id), 0)
        assert.isFalse(existsSync(join(home, "worktrees", project.id)))

        // An open thread refuses it too, without recording the message.
        const session = yield* sessions.create({ projectId: project.id })
        const again = yield* sessions
          .sendMessage(session.id, "Read this", [upload("report.docx", ZIP)])
          .pipe(Effect.flip)
        assert.strictEqual(again._tag, "AttachmentRejected")
        assert.lengthOf((yield* contents(session.id)).messages, 0)
        assert.lengthOf(yield* Ref.get(log.sent), 0)

        // Files need a message to go with.
        const empty = yield* sessions
          .create({ projectId: project.id, attachments: [upload("a.png", PNG)] })
          .pipe(Effect.flip)
        assert.strictEqual(empty._tag, "AttachmentRejected")

        // A payload that is not base64 is refused rather than half-decoded.
        const broken = yield* sessions
          .sendMessage(session.id, "hi", [{ name: "a.png", data: "not base64!" }])
          .pipe(Effect.flip)
        assert.strictEqual(broken._tag, "AttachmentRejected")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("another session's attachment cannot be read through this one", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const owner = yield* sessions.create({
          projectId: project.id,
          prompt: "look",
          attachments: [upload("a.png", PNG)],
        })
        const other = yield* sessions.create({ projectId: project.id })
        yield* waitForStatus(owner.id, "idle")
        const first = (yield* contents(owner.id)).messages[0]?.content
        const id = first?._tag === "user" ? first.attachments?.[0]?.id : undefined
        if (id === undefined) return assert.fail("expected an attachment")
        const result = yield* sessions.attachment(other.id, id).pipe(Effect.flip)
        assert.strictEqual(result._tag, "AttachmentNotFound")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("removing the project deletes its attachments", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const projects = yield* ProjectService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({
          projectId: project.id,
          prompt: "look",
          attachments: [upload("a.png", PNG)],
        })
        yield* waitForStatus(session.id, "idle")
        assert.lengthOf(readdirSync(join(home, "attachments", session.id)), 1)
        yield* projects.remove(project.id)
        assert.isFalse(existsSync(join(home, "attachments", session.id)))
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )
})
