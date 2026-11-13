import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { GitHubService } from "../src/services/GitHubService.ts"
import { GitHubToken } from "../src/services/GitHubToken.ts"
import { PullRequestService } from "../src/services/PullRequestService.ts"
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

/** A GitHub with one open pull request for `feat/login`, counting what it is asked. */
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

describe("PullRequestService", () => {
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

        // What the header button and every tool call ask for: no request leaves.
        for (let call = 0; call < 5; call++) {
          const publication = yield* pullRequests.publication(session.id)
          assert.deepInclude(publication, { forge: "github", branch: "feat/login", upstream: null })
        }
        assert.lengthOf(requests, 0)

        // Watching asks once: the lookup, two for the checks, three for the comments.
        const [feed] = yield* pullRequests.watch(session.id).pipe(Stream.take(1), Stream.runCollect)
        assert.strictEqual(feed?.pullRequest?.number, 7)
        assert.deepInclude(feed, { problem: null, pausedUntil: null, needsToken: false })
        assert.lengthOf(requests, 6)

        // A second look within the minute is answered from what the daemon knows.
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
