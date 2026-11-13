import { assert, describe, expect, it } from "@effect/vitest"
import type { PullRequest, PullRequestCheck, PullRequestFeed } from "@humanity/contracts"
import { Effect, Fiber, Layer, Stream } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { TestClock } from "effect/testing"
import { ForgeSync, type ForgeTarget, nextPollDelay } from "../src/services/ForgeSync.ts"
import { GitHubService } from "../src/services/GitHubService.ts"
import { GitHubToken } from "../src/services/GitHubToken.ts"
import { offlineGitLab } from "./helpers.ts"

interface Reply {
  readonly status?: number
  readonly body?: unknown
  readonly headers?: Record<string, string>
}

const pull = (extra: Record<string, unknown> = {}) => ({
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
  ...extra,
})

/** What GitHub says of a pull request with no checks and no comments. */
const quiet = (url: string, pulls: ReadonlyArray<unknown>): Reply => {
  if (url.includes("/pulls?head=")) return { body: pulls }
  if (url.includes("/check-runs")) return { body: { check_runs: [] } }
  if (url.includes("/status")) return { body: { statuses: [] } }
  return { body: [] }
}

/** A fake GitHub that counts what it is asked. */
const fakeGitHub = (answer: (url: string, count: number) => Reply) => {
  const requests: Array<string> = []
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requests.push(request.url)
      const reply = answer(request.url, requests.length)
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(reply.body ?? []), {
          status: reply.status ?? 200,
          headers: { "content-type": "application/json", ...reply.headers },
        }),
      )
    }),
  )
  return { client, requests }
}

const services = (client: HttpClient.HttpClient, authenticated = true) =>
  ForgeSync.layer.pipe(
    Layer.provideMerge(
      GitHubService.layer.pipe(
        Layer.provide(GitHubToken.layerTest(authenticated ? "tok" : undefined)),
        Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
      ),
    ),
    Layer.provideMerge(offlineGitLab),
  )

const target: ForgeTarget = { forge: "github", fullName: "acme/app", branch: "feat/login" }

/** Reading a response body takes real time, which the test clock does not move. */
const settle = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

const pass = (duration: Parameters<typeof TestClock.adjust>[0]) =>
  Effect.andThen(TestClock.adjust(duration), settle)

/** Watches `target` in the background and keeps every feed it is sent. */
const watching = Effect.gen(function* () {
  const sync = yield* ForgeSync
  const seen: Array<PullRequestFeed> = []
  const fiber = yield* sync.watch(target).pipe(
    Stream.runForEach((feed) => Effect.sync(() => void seen.push(feed))),
    Effect.forkScoped,
  )
  yield* settle
  return { seen, fiber }
})

/** One look at the pull request: the lookup, two for its checks, three for its comments. */
const ONE_LOOK = 6

const check = (status: PullRequestCheck["status"]): PullRequestCheck => ({
  name: "ci",
  status,
  description: null,
  url: null,
  startedAt: null,
  finishedAt: null,
})

const pullRequest = (state: PullRequest["state"]): PullRequest => ({
  forge: "github",
  number: 7,
  title: "Add login",
  body: "",
  url: "https://github.com/acme/app/pull/7",
  state,
  base: "main",
  head: "feat/login",
  headSha: "abc123",
  author: "octocat",
  createdAt: "2026-11-10T10:00:00Z",
})

describe("nextPollDelay", () => {
  it("asks every minute while a pull request is open or may still appear", () => {
    expect(nextPollDelay({ pullRequest: null, checks: [] })).toBe(60_000)
    expect(nextPollDelay({ pullRequest: pullRequest("open"), checks: [] })).toBe(60_000)
    expect(nextPollDelay({ pullRequest: pullRequest("draft"), checks: [] })).toBe(60_000)
  })

  it("slows down for a closed one and stops for a merged one whose checks are done", () => {
    expect(nextPollDelay({ pullRequest: pullRequest("closed"), checks: [] })).toBe(900_000)
    expect(nextPollDelay({ pullRequest: pullRequest("merged"), checks: [check("running")] })).toBe(
      60_000,
    )
    expect(
      nextPollDelay({ pullRequest: pullRequest("merged"), checks: [check("success")] }),
    ).toBeNull()
  })
})

describe("ForgeSync", () => {
  it.effect("asks the forge once for everyone watching a branch, then once a minute", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeGitHub((url) => quiet(url, [pull()]))
      yield* Effect.gen(function* () {
        const first = yield* watching
        const second = yield* watching
        assert.lengthOf(requests, ONE_LOOK)
        assert.strictEqual(first.seen.at(-1)?.pullRequest?.number, 7)
        // The second watcher is told what is already known, without a request.
        assert.deepStrictEqual(second.seen, [first.seen.at(-1)])

        yield* pass("59 seconds")
        assert.lengthOf(requests, ONE_LOOK)
        yield* pass("2 seconds")
        assert.lengthOf(requests, ONE_LOOK * 2)
        assert.lengthOf(second.seen, 2)
      }).pipe(Effect.provide(services(client)))
    }),
  )

  it.effect("stops asking when nobody watches and remembers what it heard", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeGitHub((url) => quiet(url, [pull()]))
      yield* Effect.gen(function* () {
        const { fiber } = yield* watching
        yield* Fiber.interrupt(fiber)
        yield* pass("30 seconds")
        assert.lengthOf(requests, ONE_LOOK)

        // Back within the minute: answered from what is known.
        const again = yield* watching
        assert.strictEqual(again.seen[0]?.pullRequest?.number, 7)
        assert.lengthOf(requests, ONE_LOOK)
        yield* Fiber.interrupt(again.fiber)

        // Gone for ten minutes: nothing was asked meanwhile, and coming back asks once.
        yield* pass("10 minutes")
        assert.lengthOf(requests, ONE_LOOK)
        yield* watching
        assert.lengthOf(requests, ONE_LOOK * 2)
      }).pipe(Effect.provide(services(client)))
    }),
  )

  it.effect("without a token asks only when the human refreshes", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeGitHub((url) => quiet(url, [pull()]))
      yield* Effect.gen(function* () {
        const sync = yield* ForgeSync
        const { seen } = yield* watching
        assert.lengthOf(requests, 0)
        assert.deepInclude(seen.at(-1), { needsToken: true, pullRequest: null, fetchedAt: null })
        yield* pass("10 minutes")
        assert.lengthOf(requests, 0)

        yield* sync.refresh(target)
        yield* settle
        assert.lengthOf(requests, ONE_LOOK)
        assert.strictEqual(seen.at(-1)?.pullRequest?.number, 7)
        assert.isTrue(seen.at(-1)?.needsToken)
        yield* pass("10 minutes")
        assert.lengthOf(requests, ONE_LOOK)
      }).pipe(Effect.provide(services(client, false)))
    }),
  )

  it.effect("leaves a merged pull request alone once its checks are done", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeGitHub((url) =>
        quiet(url, [pull({ state: "closed", merged_at: "2026-11-11T00:00:00Z" })]),
      )
      yield* Effect.gen(function* () {
        const sync = yield* ForgeSync
        const { seen } = yield* watching
        assert.strictEqual(seen.at(-1)?.pullRequest?.state, "merged")
        yield* pass("2 hours")
        assert.lengthOf(requests, ONE_LOOK)
        // The human can still ask.
        yield* sync.refresh(target)
        yield* settle
        assert.lengthOf(requests, ONE_LOOK * 2)
      }).pipe(Effect.provide(services(client)))
    }),
  )

  it.effect("keeps what it knows through a rate limit and resumes after the reset", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeGitHub((url, count) =>
        count > ONE_LOOK && count <= ONE_LOOK + 1
          ? {
              status: 403,
              body: { message: "API rate limit exceeded" },
              headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "600" },
            }
          : quiet(url, [pull()]),
      )
      yield* Effect.gen(function* () {
        const { seen } = yield* watching
        yield* pass("61 seconds")
        assert.lengthOf(requests, ONE_LOOK + 1)
        const paused = seen.at(-1)
        assert.strictEqual(paused?.pullRequest?.number, 7)
        assert.strictEqual(paused?.pausedUntil, new Date(601_000).toISOString())
        assert.include(paused?.problem, "rate limit")

        // Nothing leaves while the limit holds.
        yield* pass("8 minutes")
        assert.lengthOf(requests, ONE_LOOK + 1)
        yield* pass("70 seconds")
        assert.lengthOf(requests, ONE_LOOK * 2 + 1)
        assert.deepInclude(seen.at(-1), { pausedUntil: null, problem: null })
      }).pipe(Effect.provide(services(client)))
    }),
  )

  it.effect("reports a forge that fails and asks again more slowly", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeGitHub(() => ({ status: 500, body: { message: "boom" } }))
      yield* Effect.gen(function* () {
        const { seen } = yield* watching
        assert.lengthOf(requests, 1)
        assert.deepInclude(seen.at(-1), { pullRequest: null, pausedUntil: null })
        assert.include(seen.at(-1)?.problem, "boom")
        yield* pass("61 seconds")
        assert.lengthOf(requests, 2)
        // The second failure doubles the wait.
        yield* pass("61 seconds")
        assert.lengthOf(requests, 2)
        yield* pass("60 seconds")
        assert.lengthOf(requests, 3)
      }).pipe(Effect.provide(services(client)))
    }),
  )

  it.effect("shows a pull request Humanity just opened, then asks for its checks", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeGitHub((url, count) =>
        quiet(url, count === 1 ? [] : [pull()]),
      )
      yield* Effect.gen(function* () {
        const sync = yield* ForgeSync
        const { seen } = yield* watching
        assert.lengthOf(requests, 1)
        assert.isNull(seen.at(-1)?.pullRequest)

        yield* sync.opened(target, pullRequest("open"))
        yield* settle
        assert.strictEqual(seen.at(-1)?.pullRequest?.number, 7)
        assert.lengthOf(requests, 1)
        yield* pass("6 seconds")
        assert.lengthOf(requests, 1 + ONE_LOOK)
        // A push is followed sooner than a quiet branch, for the checks it starts.
        yield* pass("16 seconds")
        assert.lengthOf(requests, 1 + ONE_LOOK * 2)
      }).pipe(Effect.provide(services(client)))
    }),
  )

  it.effect("asks again shortly after a push", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeGitHub((url) => quiet(url, [pull()]))
      yield* Effect.gen(function* () {
        const sync = yield* ForgeSync
        yield* watching
        yield* pass("20 seconds")
        yield* sync.changed(target)
        yield* settle
        assert.lengthOf(requests, ONE_LOOK * 2)
        // A second push right behind it waits for the spacing.
        yield* sync.changed(target)
        yield* settle
        assert.lengthOf(requests, ONE_LOOK * 2)
        yield* pass("6 seconds")
        assert.lengthOf(requests, ONE_LOOK * 3)
      }).pipe(Effect.provide(services(client)))
    }),
  )
})
