import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Ref } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import {
  GITHUB_API,
  githubCheckRunStatus,
  githubCommitStatus,
  GitHubService,
} from "../src/services/GitHubService.ts"
import { GitHubToken } from "../src/services/GitHubToken.ts"
import { gitlabApi, gitlabJobStatus, GitLabService } from "../src/services/GitLabService.ts"
import { GitLabToken } from "../src/services/GitLabToken.ts"

interface Reply {
  readonly status?: number
  readonly body: unknown
}

interface Recorded {
  readonly method: string
  readonly url: string
  readonly auth: string | undefined
  readonly body: unknown
}

/** A fake API: replies by `METHOD url`, and records each request. */
const fakeApi = (routes: Record<string, Reply>) =>
  Effect.gen(function* () {
    const requests = yield* Ref.make<ReadonlyArray<Recorded>>([])
    const client = HttpClient.make((request) =>
      Effect.gen(function* () {
        const text = request.body._tag === "Uint8Array" ? request.body.text : undefined
        yield* Ref.update(requests, (all) => [
          ...all,
          {
            method: request.method,
            url: request.url,
            auth: request.headers["authorization"],
            body: text === undefined ? undefined : JSON.parse(text),
          },
        ])
        const reply = routes[`${request.method} ${request.url}`] ?? {
          status: 404,
          body: { message: "Not Found" },
        }
        return HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(reply.body), {
            status: reply.status ?? 200,
            headers: { "content-type": "application/json" },
          }),
        )
      }),
    )
    return { client, requests }
  })

const github = (client: HttpClient.HttpClient, token: string | undefined) =>
  GitHubService.layer.pipe(
    Layer.provide(GitHubToken.layerTest(token)),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )

const gitlab = (client: HttpClient.HttpClient, token: string | undefined) =>
  GitLabService.layer.pipe(
    Layer.provide(GitLabToken.layerTest(token)),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )

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

const user = { login: "octocat", avatar_url: "https://x/o.png" }
const REPO = `${GITHUB_API}/repos/acme/app`

describe("CI status mapping", () => {
  it("reads a GitHub check run's status and conclusion", () => {
    expect(githubCheckRunStatus("queued", null)).toBe("queued")
    expect(githubCheckRunStatus("in_progress", null)).toBe("running")
    expect(githubCheckRunStatus("completed", "success")).toBe("success")
    expect(githubCheckRunStatus("completed", "timed_out")).toBe("failure")
    expect(githubCheckRunStatus("completed", "cancelled")).toBe("cancelled")
    expect(githubCheckRunStatus("completed", "skipped")).toBe("skipped")
    expect(githubCheckRunStatus("completed", "neutral")).toBe("neutral")
  })

  it("reads a GitHub commit status", () => {
    expect(githubCommitStatus("pending")).toBe("running")
    expect(githubCommitStatus("error")).toBe("failure")
    expect(githubCommitStatus("success")).toBe("success")
  })

  it("reads a GitLab job, where a job allowed to fail never fails the checks", () => {
    expect(gitlabJobStatus("failed", false)).toBe("failure")
    expect(gitlabJobStatus("failed", true)).toBe("neutral")
    expect(gitlabJobStatus("pending", false)).toBe("queued")
    expect(gitlabJobStatus("canceled", false)).toBe("cancelled")
    expect(gitlabJobStatus("manual", false)).toBe("neutral")
  })
})

describe("GitHub pull requests", () => {
  it.effect("finds a branch's open pull request before its older closed ones", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeApi({
        [`GET ${REPO}/pulls?head=acme%3Afeat%2Flogin&state=all&sort=updated&direction=desc&per_page=20`]:
          {
            body: [
              pull({ number: 3, state: "closed", merged_at: "2026-11-01T00:00:00Z" }),
              pull({ draft: true }),
            ],
          },
      })
      const found = yield* GitHubService.use((service) =>
        service.findPullRequest("acme/app", "feat/login"),
      ).pipe(Effect.provide(github(client, "tok")))
      assert.isTrue(Option.isSome(found))
      const value = Option.getOrThrow(found)
      assert.strictEqual(value.number, 7)
      assert.strictEqual(value.state, "draft")
      assert.strictEqual(value.headSha, "abc123")
      assert.strictEqual((yield* Ref.get(requests))[0]?.auth, "Bearer tok")
    }),
  )

  it.effect("tells merged from closed, and finds nothing for a branch without one", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeApi({
        [`GET ${REPO}/pulls?head=acme%3Adone&state=all&sort=updated&direction=desc&per_page=20`]: {
          body: [pull({ state: "closed", merged_at: "2026-11-01T00:00:00Z" })],
        },
        [`GET ${REPO}/pulls?head=acme%3Anew&state=all&sort=updated&direction=desc&per_page=20`]: {
          body: [],
        },
      })
      const [done, fresh] = yield* GitHubService.use((service) =>
        Effect.all([
          service.findPullRequest("acme/app", "done"),
          service.findPullRequest("acme/app", "new"),
        ]),
      ).pipe(Effect.provide(github(client, "tok")))
      assert.strictEqual(Option.getOrThrow(done).state, "merged")
      assert.isTrue(Option.isNone(fresh))
    }),
  )

  it.effect("opens a pull request with the token, and needs one to do it", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeApi({
        [`POST ${REPO}/pulls`]: { status: 201, body: pull({ body: "Why and how" }) },
      })
      const input = {
        head: "feat/login",
        base: "main",
        title: "Add login",
        body: "Why and how",
        draft: false,
      }
      const created = yield* GitHubService.use((service) =>
        service.createPullRequest("acme/app", input),
      ).pipe(Effect.provide(github(client, "tok")))
      assert.strictEqual(created.url, "https://github.com/acme/app/pull/7")
      assert.strictEqual(created.body, "Why and how")
      const [request] = yield* Ref.get(requests)
      assert.deepStrictEqual(request?.body, input)
      assert.strictEqual(request?.auth, "Bearer tok")

      const error = yield* GitHubService.use((service) =>
        Effect.flip(service.createPullRequest("acme/app", input)),
      ).pipe(Effect.provide(github(client, undefined)))
      assert.strictEqual(error._tag, "GitHubNotAuthenticated")
    }),
  )

  it.effect("lists check runs and commit statuses of the head commit", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeApi({
        [`GET ${REPO}/commits/abc123/check-runs?per_page=100`]: {
          body: {
            check_runs: [
              {
                name: "test",
                status: "completed",
                conclusion: "failure",
                html_url: "https://github.com/acme/app/runs/1",
                started_at: "2026-11-10T10:00:00Z",
                completed_at: "2026-11-10T10:05:00Z",
                output: { title: "2 tests failed" },
              },
            ],
          },
        },
        [`GET ${REPO}/commits/abc123/status?per_page=100`]: {
          body: {
            statuses: [
              {
                context: "deploy/preview",
                state: "pending",
                description: "Building",
                target_url: null,
                created_at: "2026-11-10T10:00:00Z",
                updated_at: "2026-11-10T10:01:00Z",
              },
            ],
          },
        },
      })
      const checks = yield* GitHubService.use((service) =>
        service.checks("acme/app", "abc123"),
      ).pipe(Effect.provide(github(client, "tok")))
      assert.deepStrictEqual(
        checks.map((check) => [check.name, check.status, check.description, check.finishedAt]),
        [
          ["test", "failure", "2 tests failed", "2026-11-10T10:05:00Z"],
          ["deploy/preview", "running", "Building", null],
        ],
      )
    }),
  )

  it.effect("gathers conversation, review and inline comments, oldest first", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeApi({
        [`GET ${REPO}/issues/7/comments?per_page=100`]: {
          body: [
            {
              id: 1,
              user,
              body: "Looks good overall",
              created_at: "2026-11-10T12:00:00Z",
              html_url: "https://github.com/acme/app/pull/7#issuecomment-1",
            },
          ],
        },
        [`GET ${REPO}/pulls/7/comments?per_page=100`]: {
          body: [
            {
              id: 2,
              user,
              body: "Rename this",
              created_at: "2026-11-10T11:00:00Z",
              html_url: "https://github.com/acme/app/pull/7#discussion_r2",
              path: "src/login.ts",
              line: 12,
            },
          ],
        },
        [`GET ${REPO}/pulls/7/reviews?per_page=100`]: {
          body: [
            {
              id: 3,
              user,
              body: "",
              state: "COMMENTED",
              submitted_at: "2026-11-10T11:00:00Z",
              html_url: "https://github.com/acme/app/pull/7#pullrequestreview-3",
            },
            {
              id: 4,
              user,
              body: "",
              state: "APPROVED",
              submitted_at: "2026-11-10T13:00:00Z",
              html_url: "https://github.com/acme/app/pull/7#pullrequestreview-4",
            },
          ],
        },
      })
      const comments = yield* GitHubService.use((service) => service.comments("acme/app", 7)).pipe(
        Effect.provide(github(client, "tok")),
      )
      assert.deepStrictEqual(
        comments.map((comment) => [comment.kind, comment.path, comment.line, comment.reviewState]),
        [
          ["inline", "src/login.ts", 12, null],
          ["comment", null, null, null],
          ["review", null, null, "approved"],
        ],
      )
    }),
  )
})

const GITLAB = `${gitlabApi("gitlab.com")}/projects/acme%2Fapp`

const mergeRequest = (extra: Record<string, unknown> = {}) => ({
  iid: 5,
  title: "Add login",
  description: "Why",
  web_url: "https://gitlab.com/acme/app/-/merge_requests/5",
  state: "opened",
  draft: false,
  target_branch: "main",
  source_branch: "feat/login",
  sha: "def456",
  author: { username: "tanuki" },
  created_at: "2026-11-10T10:00:00Z",
  ...extra,
})

describe("GitLab merge requests", () => {
  it.effect("finds a branch's open merge request", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeApi({
        [`GET ${GITLAB}/merge_requests?source_branch=feat%2Flogin&state=all&order_by=updated_at&sort=desc&per_page=20`]:
          { body: [mergeRequest({ iid: 2, state: "merged" }), mergeRequest()] },
      })
      const found = yield* GitLabService.use((service) =>
        service.findMergeRequest("acme/app", "feat/login"),
      ).pipe(Effect.provide(gitlab(client, "glpat")))
      const value = Option.getOrThrow(found)
      assert.strictEqual(value.number, 5)
      assert.strictEqual(value.forge, "gitlab")
      assert.strictEqual(value.state, "open")
    }),
  )

  it.effect("opens a draft merge request by its title", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeApi({
        [`POST ${GITLAB}/merge_requests`]: {
          status: 201,
          body: mergeRequest({ title: "Draft: Add login", draft: true }),
        },
      })
      const created = yield* GitLabService.use((service) =>
        service.createMergeRequest("acme/app", {
          sourceBranch: "feat/login",
          targetBranch: "main",
          title: "Add login",
          description: "Why",
          draft: true,
        }),
      ).pipe(Effect.provide(gitlab(client, "glpat")))
      assert.strictEqual(created.state, "draft")
      const [request] = yield* Ref.get(requests)
      assert.deepStrictEqual(request?.body, {
        source_branch: "feat/login",
        target_branch: "main",
        title: "Draft: Add login",
        description: "Why",
      })
    }),
  )

  it.effect("lists the jobs of the latest pipeline, and nothing without one", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeApi({
        [`GET ${GITLAB}/merge_requests/5/pipelines?per_page=1`]: { body: [{ id: 99 }] },
        [`GET ${GITLAB}/pipelines/99/jobs?per_page=100`]: {
          body: [
            {
              name: "lint",
              stage: "test",
              status: "success",
              web_url: "https://gitlab.com/acme/app/-/jobs/1",
              started_at: "2026-11-10T10:00:00Z",
              finished_at: "2026-11-10T10:01:00Z",
            },
            { name: "e2e", stage: "test", status: "failed", allow_failure: true },
          ],
        },
        [`GET ${GITLAB}/merge_requests/6/pipelines?per_page=1`]: { body: [] },
      })
      const [checks, none] = yield* GitLabService.use((service) =>
        Effect.all([service.checks("acme/app", 5), service.checks("acme/app", 6)]),
      ).pipe(Effect.provide(gitlab(client, "glpat")))
      assert.deepStrictEqual(
        checks.map((check) => [check.name, check.status, check.description]),
        [
          ["lint", "success", "test"],
          ["e2e", "neutral", "test"],
        ],
      )
      assert.deepStrictEqual(none, [])
    }),
  )

  it.effect("keeps human notes, inline ones with their file and line", () =>
    Effect.gen(function* () {
      const author = { username: "tanuki", avatar_url: null }
      const { client } = yield* fakeApi({
        [`GET ${GITLAB}/merge_requests/5/notes?sort=asc&order_by=created_at&per_page=100`]: {
          body: [
            {
              id: 1,
              body: "added 1 commit",
              author,
              created_at: "2026-11-10T10:00:00Z",
              system: true,
            },
            {
              id: 2,
              body: "Rename this",
              author,
              created_at: "2026-11-10T11:00:00Z",
              system: false,
              type: "DiffNote",
              position: { new_path: "src/login.ts", new_line: 12 },
            },
            { id: 3, body: "LGTM", author, created_at: "2026-11-10T12:00:00Z", system: false },
          ],
        },
      })
      const comments = yield* GitLabService.use((service) =>
        service.comments("acme/app", {
          forge: "gitlab",
          number: 5,
          title: "Add login",
          body: "",
          url: "https://gitlab.com/acme/app/-/merge_requests/5",
          state: "open",
          base: "main",
          head: "feat/login",
          headSha: "def456",
          author: "tanuki",
          createdAt: "2026-11-10T10:00:00Z",
        }),
      ).pipe(Effect.provide(gitlab(client, "glpat")))
      assert.deepStrictEqual(
        comments.map((comment) => [comment.kind, comment.path, comment.line, comment.url]),
        [
          ["inline", "src/login.ts", 12, "https://gitlab.com/acme/app/-/merge_requests/5#note_2"],
          ["comment", null, null, "https://gitlab.com/acme/app/-/merge_requests/5#note_3"],
        ],
      )
    }),
  )
})
