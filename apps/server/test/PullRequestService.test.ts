import { assert, describe, it } from "@effect/vitest"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { Effect, Layer, Stream } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { GitHubService } from "../src/services/GitHubService.ts"
import { GitHubToken } from "../src/services/GitHubToken.ts"
import { noreplyAvatar, PullRequestService } from "../src/services/PullRequestService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { git } from "./helpers.ts"
import { addProject, services, setup, waitForStatus } from "./sessionHelpers.ts"

const pull = {
  number: 7,
  title: "Add login",
  body: null,
  html_url: "https://github.com/acme/app/pull/7",
  state: "open",
  draft: false,
  merged_at: null,
  base: { ref: "main" },
  head: { ref: "feat/login", sha: "abc123" },
  user: { login: "octocat" },
  created_at: "2026-11-10T10:00:00Z",
}

const fakeGitHub = () => {
  const requests: Array<string> = []
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requests.push(request.url)
      const body = request.url.includes("/pulls?head=")
        ? [pull]
        : request.url.includes("/check-runs")
          ? { check_runs: [] }
          : request.url.includes("/status")
            ? { statuses: [] }
            : []
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }),
      )
    }),
  )
  const layer = GitHubService.layer.pipe(
    Layer.provide(GitHubToken.layerTest("tok")),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )
  return { requests, layer }
}

/** A GitHub whose pull request for the branch is `current`, recording every write. */
const fakeForge = (current: () => Record<string, unknown>) => {
  const writes: Array<{ method: string; url: string; body: unknown }> = []
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      if (request.method !== "GET") {
        const text = (request.body._tag === "Uint8Array" ? request.body.text : undefined) ?? "null"
        writes.push({ method: request.method, url: request.url, body: JSON.parse(text) })
      }
      const body = request.url.includes("/merge")
        ? { merged: true }
        : request.url.includes("/pulls?head=")
          ? [current()]
          : request.url.endsWith("/pulls/7")
            ? { ...current(), state: "closed", merged_at: "2026-11-19T10:00:00Z" }
            : request.url.includes("/comments")
              ? { id: 1 }
              : request.url.includes("/check-runs")
                ? { check_runs: [] }
                : request.url.includes("/status")
                  ? { statuses: [] }
                  : []
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }),
      )
    }),
  )
  const layer = GitHubService.layer.pipe(
    Layer.provide(GitHubToken.layerTest("tok")),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )
  return { writes, layer }
}

describe("PullRequestService", () => {
  it.live("merges only an open pull request at the commit the human saw, comment first", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      git(repo, "remote", "add", "origin", "https://github.com/acme/app.git")
      git(repo, "checkout", "--quiet", "-b", "feat/login")
      let current: Record<string, unknown> = { ...pull, draft: true }
      const { writes, layer } = fakeForge(() => current)

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const pullRequests = yield* PullRequestService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")
        const merge = (headSha: string) =>
          pullRequests.merge(session.id, { method: "squash", comment: " Ship it ", headSha })

        const draft = yield* Effect.flip(merge("abc123"))
        assert.include(draft.message, "is a draft")

        current = pull
        const moved = yield* Effect.flip(merge("old999"))
        assert.include(moved.message, "new commits since you looked")
        assert.lengthOf(writes, 0)

        const merged = yield* merge("abc123")
        assert.strictEqual(merged.state, "merged")
        assert.deepStrictEqual(
          writes.map((write) => [write.method, write.body]),
          [
            ["POST", { body: "Ship it" }],
            ["PUT", { merge_method: "squash", sha: "abc123" }],
          ],
        )
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }], undefined, undefined, layer)))
    }),
  )

  it.live("closes an open pull request, and refuses to close it twice", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      git(repo, "remote", "add", "origin", "https://github.com/acme/app.git")
      git(repo, "checkout", "--quiet", "-b", "feat/login")
      const { writes, layer } = fakeForge(() => ({ ...pull, state: "closed" }))

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const pullRequests = yield* PullRequestService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")

        const error = yield* Effect.flip(pullRequests.setOpen(session.id, false))
        assert.include(error.message, "already closed")
        const draft = yield* Effect.flip(pullRequests.setDraft(session.id, true))
        assert.include(draft.message, "closed")
        assert.lengthOf(writes, 0)
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }], undefined, undefined, layer)))
    }),
  )

  it.live("reads where the branch stands from git alone, and the pull request from the feed", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      git(repo, "remote", "add", "origin", "https://github.com/acme/app.git")
      git(repo, "checkout", "--quiet", "-b", "feat/login")
      const { requests, layer } = fakeGitHub()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const pullRequests = yield* PullRequestService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")

        for (let call = 0; call < 5; call++) {
          const publication = yield* pullRequests.publication(session.id)
          assert.deepInclude(publication, { forge: "github", branch: "feat/login", upstream: null })
        }
        assert.lengthOf(requests, 0)

        const [feed] = yield* pullRequests.watch(session.id).pipe(Stream.take(1), Stream.runCollect)
        assert.strictEqual(feed?.pullRequest?.number, 7)
        assert.deepInclude(feed, { problem: null, pausedUntil: null, needsToken: false })
        assert.lengthOf(requests, 6)

        const [again] = yield* pullRequests
          .watch(session.id)
          .pipe(Stream.take(1), Stream.runCollect)
        assert.deepStrictEqual(again, feed)
        assert.lengthOf(requests, 6)
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }], undefined, undefined, layer)))
    }),
  )

  it.live("says why a project it cannot follow has nothing to show, without asking", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const { requests, layer } = fakeGitHub()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const pullRequests = yield* PullRequestService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")

        assert.isNull((yield* pullRequests.publication(session.id)).forge)
        const feeds = yield* pullRequests.watch(session.id).pipe(Stream.runCollect)
        assert.lengthOf(feeds, 1)
        assert.deepInclude(feeds[0], { pullRequest: null, fetchedAt: null, problem: null })
        yield* pullRequests.refresh(session.id)
        assert.lengthOf(requests, 0)
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }], undefined, undefined, layer)))
    }),
  )
})

describe("PullRequestService.commits", () => {
  it.live("marks what origin has as pushed, links it, and finds its author's picture", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      git(repo, "remote", "add", "origin", "https://github.com/acme/app.git")
      git(repo, "checkout", "--quiet", "-b", "feat/login")
      for (const name of ["a", "b"]) {
        writeFileSync(join(repo, `${name}.txt`), `${name}\n`)
        git(repo, "add", "--all")
        git(repo, "commit", "--quiet", "--message", `add ${name}`)
      }
      const pushed = git(repo, "rev-parse", "HEAD~1").trim()
      const unpushed = git(repo, "rev-parse", "HEAD").trim()
      git(repo, "update-ref", "refs/remotes/origin/feat/login", pushed)
      git(repo, "branch", "--quiet", "--set-upstream-to=origin/feat/login")
      const email = git(repo, "config", "user.email").trim()

      const requests: Array<string> = []
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url)
          const body = request.url.includes("/commits?sha=")
            ? [
                {
                  sha: pushed,
                  commit: { author: { email } },
                  author: { login: "ana", avatar_url: "https://avatars.example/ana" },
                },
              ]
            : []
          return HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }),
          )
        }),
      )
      const layer = GitHubService.layer.pipe(
        Layer.provide(GitHubToken.layerTest("tok")),
        Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
      )

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const pullRequests = yield* PullRequestService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")

        const listed = yield* pullRequests.commits(session.id)
        assert.deepStrictEqual(
          listed.commits.slice(0, 2).map(({ hash, pushed, url, avatarUrl, files, insertions }) => ({
            hash,
            pushed,
            url,
            avatarUrl,
            files,
            insertions,
          })),
          [
            {
              hash: unpushed,
              pushed: false,
              url: null,
              avatarUrl: "https://avatars.example/ana",
              files: 1,
              insertions: 1,
            },
            {
              hash: pushed,
              pushed: true,
              url: `https://github.com/acme/app/commit/${pushed}`,
              avatarUrl: "https://avatars.example/ana",
              files: 1,
              insertions: 1,
            },
          ],
        )
        assert.isTrue(
          requests.some((url) => url.includes("/repos/acme/app/commits?sha=feat%2Flogin")),
        )

        const compared = yield* pullRequests.compare(session.id, "main")
        assert.strictEqual(compared.base, "main")
        assert.deepStrictEqual(
          compared.commits.map((commit) => commit.hash),
          [unpushed, pushed],
        )
        assert.deepStrictEqual(
          compared.files.map(({ filePath, kind }) => ({ filePath, kind })),
          [
            { filePath: "a.txt", kind: "create" },
            { filePath: "b.txt", kind: "create" },
          ],
        )
        const missing = yield* Effect.flip(pullRequests.compare(session.id, "nope"))
        assert.strictEqual(missing._tag, "PullRequestUnavailable")
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }], undefined, undefined, layer)))
    }),
  )
})

describe("noreplyAvatar", () => {
  it("reads GitHub's private emails, and nothing else", () => {
    assert.strictEqual(
      noreplyAvatar("12345+ana@users.noreply.github.com"),
      "https://avatars.githubusercontent.com/u/12345?v=4",
    )
    assert.strictEqual(noreplyAvatar("ana@users.noreply.github.com"), "https://github.com/ana.png")
    assert.isNull(noreplyAvatar("ana@example.com"))
  })
})
