import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { TestClock } from "effect/testing"
import { ForgeBackground, quotaFromHeaders, retryAfter } from "../src/services/ForgeGate.ts"
import { GITHUB_API, GitHubService } from "../src/services/GitHubService.ts"
import { GitHubToken } from "../src/services/GitHubToken.ts"
import { gitlabApi, GitLabService } from "../src/services/GitLabService.ts"
import { GitLabToken } from "../src/services/GitLabToken.ts"

interface Seen {
  readonly url: string
  readonly ifNoneMatch: string | undefined
}

interface Reply {
  readonly status?: number
  readonly body?: unknown
  readonly headers?: Record<string, string>
}

/** A fake forge: `answer` sees each request, and everything asked is recorded. */
const fakeForge = (answer: (seen: Seen, count: number) => Reply) => {
  const requests: Array<Seen> = []
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const seen = { url: request.url, ifNoneMatch: request.headers["if-none-match"] }
      requests.push(seen)
      const reply = answer(seen, requests.length)
      const status = reply.status ?? 200
      return HttpClientResponse.fromWeb(
        request,
        new Response(status === 304 ? null : JSON.stringify(reply.body ?? []), {
          status,
          headers: { "content-type": "application/json", ...reply.headers },
        }),
      )
    }),
  )
  return { client, requests }
}

const github = (client: HttpClient.HttpClient, token: string | undefined = "tok") =>
  GitHubService.layer.pipe(
    Layer.provide(GitHubToken.layerTest(token)),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )

const gitlab = (client: HttpClient.HttpClient) =>
  GitLabService.layer.pipe(
    Layer.provide(GitLabToken.layerTest("glpat")),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )

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

const find = GitHubService.use((service) => service.findPullRequest("acme/app", "feat/login"))

/** Quota headers as GitHub sends them; the reset is an hour after the test clock's start. */
const quota = (remaining: number) => ({
  "x-ratelimit-limit": "5000",
  "x-ratelimit-remaining": String(remaining),
  "x-ratelimit-reset": "3600",
})

describe("reading rate limit headers", () => {
  it("takes the quota only when limit, remaining and reset are all there", () => {
    expect(quotaFromHeaders(quota(42), "x-ratelimit-")).toEqual({
      limit: 5000,
      remaining: 42,
      resetAt: 3_600_000,
    })
    expect(quotaFromHeaders({ "x-ratelimit-remaining": "42" }, "x-ratelimit-")).toBeUndefined()
    expect(
      quotaFromHeaders(
        { "ratelimit-limit": "500", "ratelimit-remaining": "0", "ratelimit-reset": "60" },
        "ratelimit-",
      ),
    ).toEqual({ limit: 500, remaining: 0, resetAt: 60_000 })
  })

  it("reads Retry-After as seconds or as a date", () => {
    expect(retryAfter("30", 1_000)).toBe(31_000)
    expect(retryAfter("Thu, 01 Jan 1970 00:01:00 GMT", 1_000)).toBe(60_000)
    expect(retryAfter(undefined, 1_000)).toBeUndefined()
    expect(retryAfter("soon", 1_000)).toBeUndefined()
  })
})

describe("revalidating with ETags", () => {
  it.effect("asks GitHub again with If-None-Match and reuses the answer on a 304", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeForge((seen) =>
        seen.ifNoneMatch === 'W/"v1"'
          ? { status: 304 }
          : { body: [pull], headers: { etag: 'W/"v1"' } },
      )
      yield* Effect.gen(function* () {
        const first = Option.getOrThrow(yield* find)
        const second = Option.getOrThrow(yield* find)
        assert.deepStrictEqual(second, first)
        assert.strictEqual(second.number, 7)
      }).pipe(Effect.provide(github(client)))
      assert.deepStrictEqual(
        requests.map((request) => request.ifNoneMatch),
        [undefined, 'W/"v1"'],
      )
    }),
  )

  it.effect("takes the new answer and its new ETag once it changed", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeForge((_, count) =>
        count === 1
          ? { body: [pull], headers: { etag: '"v1"' } }
          : { body: [{ ...pull, title: "Add sign-in" }], headers: { etag: '"v2"' } },
      )
      yield* Effect.gen(function* () {
        yield* find
        assert.strictEqual(Option.getOrThrow(yield* find).title, "Add sign-in")
        yield* find
      }).pipe(Effect.provide(github(client)))
      assert.deepStrictEqual(
        requests.map((request) => request.ifNoneMatch),
        [undefined, '"v1"', '"v2"'],
      )
    }),
  )

  it.effect("keeps one token's answers apart from another's", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeForge(() => ({ body: [pull], headers: { etag: '"v1"' } }))
      yield* find.pipe(Effect.provide(github(client, "one")))
      yield* find.pipe(Effect.provide(github(client, "two")))
      assert.deepStrictEqual(
        requests.map((request) => request.ifNoneMatch),
        [undefined, undefined],
      )
    }),
  )

  it.effect("revalidates every page of a list, and GitLab's merge requests too", () =>
    Effect.gen(function* () {
      const api = `${gitlabApi("gitlab.com")}/projects/acme%2Fapp`
      const { client, requests } = fakeForge((seen) => {
        if (seen.ifNoneMatch !== undefined) return { status: 304 }
        return seen.url.includes("page=2")
          ? { body: [], headers: { etag: '"p2"' } }
          : {
              body: [],
              headers: {
                etag: '"p1"',
                link: `<${api}/merge_requests/5/notes?page=2>; rel="next"`,
              },
            }
      })
      const mergeRequest = {
        forge: "gitlab" as const,
        number: 5,
        title: "Add login",
        body: "",
        url: "https://gitlab.com/acme/app/-/merge_requests/5",
        state: "open" as const,
        base: "main",
        head: "feat/login",
        headSha: "def456",
        author: "tanuki",
        createdAt: "2026-11-10T10:00:00Z",
      }
      yield* Effect.gen(function* () {
        const service = yield* GitLabService
        yield* service.comments("acme/app", mergeRequest)
        yield* service.comments("acme/app", mergeRequest)
      }).pipe(Effect.provide(gitlab(client)))
      // The remembered `Link` header still leads to the second page.
      assert.deepStrictEqual(
        requests.map((request) => request.ifNoneMatch),
        [undefined, undefined, '"p1"', '"p2"'],
      )
    }),
  )
})

describe("staying within the rate limit", () => {
  it.effect("keeps the last tenth of the quota for what the human asks for", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeForge(() => ({ body: [pull], headers: quota(400) }))
      yield* Effect.gen(function* () {
        yield* find
        const background = yield* Effect.flip(
          find.pipe(Effect.provideService(ForgeBackground, true)),
        )
        assert.deepInclude(background, {
          _tag: "GitHubRateLimited",
          resetAt: new Date(3_600_000).toISOString(),
        })
        assert.lengthOf(requests, 1)
        // A click still goes through.
        yield* find
        assert.lengthOf(requests, 2)
        // The next window starts with a full quota.
        yield* TestClock.adjust("61 minutes")
        yield* find.pipe(Effect.provideService(ForgeBackground, true))
        assert.lengthOf(requests, 3)
      }).pipe(Effect.provide(github(client)))
    }),
  )

  it.effect("does not send a request GitHub is sure to refuse", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeForge(() => ({ body: [pull], headers: quota(0) }))
      yield* Effect.gen(function* () {
        yield* find
        assert.strictEqual((yield* Effect.flip(find))._tag, "GitHubRateLimited")
        assert.lengthOf(requests, 1)
      }).pipe(Effect.provide(github(client)))
    }),
  )

  it.effect("stays away after a secondary limit until Retry-After has passed", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeForge((_, count) =>
        count === 1
          ? {
              status: 403,
              body: { message: "You have exceeded a secondary rate limit." },
              headers: { "retry-after": "120", "x-ratelimit-remaining": "4000" },
            }
          : { body: [pull] },
      )
      yield* Effect.gen(function* () {
        const refused = yield* Effect.flip(find)
        assert.deepInclude(refused, {
          _tag: "GitHubRateLimited",
          resetAt: new Date(120_000).toISOString(),
        })
        // Even a click waits: asking while limited makes the limit last longer.
        assert.strictEqual((yield* Effect.flip(find))._tag, "GitHubRateLimited")
        assert.lengthOf(requests, 1)
        yield* TestClock.adjust("121 seconds")
        assert.isTrue(Option.isSome(yield* find))
        assert.lengthOf(requests, 2)
      }).pipe(Effect.provide(github(client)))
    }),
  )

  it.effect("backs off for a growing while when a limit names no time", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeForge(() => ({
        status: 429,
        body: { message: "slow down" },
      }))
      yield* Effect.gen(function* () {
        assert.deepInclude(yield* Effect.flip(find), { _tag: "GitHubRateLimited", resetAt: null })
        yield* TestClock.adjust("29 seconds")
        yield* Effect.flip(find)
        assert.lengthOf(requests, 1)
        yield* TestClock.adjust("2 seconds")
        yield* Effect.flip(find)
        assert.lengthOf(requests, 2)
        // The second pause is twice as long.
        yield* TestClock.adjust("31 seconds")
        yield* Effect.flip(find)
        assert.lengthOf(requests, 2)
        yield* TestClock.adjust("30 seconds")
        yield* Effect.flip(find)
        assert.lengthOf(requests, 3)
      }).pipe(Effect.provide(github(client)))
    }),
  )

  it.effect("pauses GitLab until the reset its 429 names", () =>
    Effect.gen(function* () {
      const { client, requests } = fakeForge((_, count) =>
        count === 1
          ? { status: 429, body: { message: "Retry later" }, headers: { "ratelimit-reset": "90" } }
          : { body: [] },
      )
      const lookUp = GitLabService.use((service) => service.findMergeRequest("acme/app", "feat/x"))
      yield* Effect.gen(function* () {
        assert.deepInclude(yield* Effect.flip(lookUp), {
          _tag: "GitLabRateLimited",
          resetAt: new Date(90_000).toISOString(),
        })
        yield* Effect.flip(lookUp)
        assert.lengthOf(requests, 1)
        yield* TestClock.adjust("91 seconds")
        assert.isTrue(Option.isNone(yield* lookUp))
      }).pipe(Effect.provide(gitlab(client)))
    }),
  )

  it.effect("still tells a plain 403 from a rate limit", () =>
    Effect.gen(function* () {
      const { client } = fakeForge(() => ({
        status: 403,
        body: { message: "Resource not accessible" },
        headers: { "x-ratelimit-remaining": "42" },
      }))
      const error = yield* Effect.flip(find).pipe(Effect.provide(github(client)))
      assert.deepInclude(error, { _tag: "GitHubRequestFailed", status: 403 })
      assert.strictEqual(GITHUB_API, "https://api.github.com")
    }),
  )
})
