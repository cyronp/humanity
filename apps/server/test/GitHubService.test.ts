import { NodeServices } from "@effect/platform-node"
import { assert, describe, expect, it } from "@effect/vitest"
import type { CloneEvent } from "@humanity/contracts"
import { Effect, Layer, Option, Redacted, Ref, Stream } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseLive } from "../src/db/Database.ts"
import { ServerConfig } from "../src/ServerConfig.ts"
import { GITHUB_API, GitHubService, nextPageUrl } from "../src/services/GitHubService.ts"
import { GitHubToken } from "../src/services/GitHubToken.ts"
import { GitService } from "../src/services/GitService.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { git, offlineGitLab, tempDir, tempRepo } from "./helpers.ts"

interface Reply {
  readonly status?: number
  readonly body: unknown
  readonly headers?: Record<string, string>
}

/** A fake GitHub API: replies by path, and records each request's URL and auth header. */
const fakeGitHub = (routes: Record<string, Reply>) =>
  Effect.gen(function* () {
    const requests = yield* Ref.make<ReadonlyArray<{ url: string; auth: string | undefined }>>([])
    const client = HttpClient.make((request) =>
      Effect.gen(function* () {
        yield* Ref.update(requests, (all) => [
          ...all,
          { url: request.url, auth: request.headers["authorization"] },
        ])
        const path = request.url.replace(GITHUB_API, "")
        const reply = routes[path] ?? { status: 404, body: { message: "Not Found" } }
        return HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(reply.body), {
            status: reply.status ?? 200,
            headers: { "content-type": "application/json", ...reply.headers },
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

const repo = (name: string, extra: Record<string, unknown> = {}) => ({
  full_name: `acme/${name}`,
  name,
  owner: { login: "acme" },
  description: null,
  private: false,
  default_branch: "main",
  clone_url: `https://github.com/acme/${name}.git`,
  html_url: `https://github.com/acme/${name}`,
  updated_at: "2026-11-01T00:00:00Z",
  extra_field_ignored: true,
  ...extra,
})

const PAGE_1 =
  "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member"

describe("nextPageUrl", () => {
  it("finds the next link among the others", () => {
    expect(
      nextPageUrl(
        '<https://api.github.com/user/repos?page=1>; rel="prev", <https://api.github.com/user/repos?page=3>; rel="next", <https://api.github.com/user/repos?page=9>; rel="last"',
      ),
    ).toBe("https://api.github.com/user/repos?page=3")
    expect(nextPageUrl('<https://x/1>; rel="last"')).toBeUndefined()
    expect(nextPageUrl(undefined)).toBeUndefined()
  })
})

describe("GitHubService", () => {
  it.effect("follows Link headers through every page of repositories", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeGitHub({
        [PAGE_1]: {
          body: [repo("one"), repo("two")],
          headers: { link: `<${GITHUB_API}/user/repos?page=2>; rel="next"` },
        },
        "/user/repos?page=2": { body: [repo("three", { private: true })] },
      })

      const repos = yield* GitHubService.use((service) => service.listRepos).pipe(
        Effect.provide(github(client, "secret-token")),
      )

      assert.deepStrictEqual(
        repos.map((r) => [r.fullName, r.private]),
        [
          ["acme/one", false],
          ["acme/two", false],
          ["acme/three", true],
        ],
      )
      assert.deepStrictEqual(repos[0], {
        fullName: "acme/one",
        name: "one",
        owner: "acme",
        description: null,
        private: false,
        defaultBranch: "main",
        cloneUrl: "https://github.com/acme/one.git",
        htmlUrl: "https://github.com/acme/one",
        updatedAt: "2026-11-01T00:00:00Z",
      })
      const seen = yield* Ref.get(requests)
      assert.lengthOf(seen, 2)
      assert.isTrue(seen.every((request) => request.auth === "Bearer secret-token"))
    }),
  )

  it.effect("streams lazily, one page at a time", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeGitHub({
        [PAGE_1]: {
          body: [repo("one")],
          headers: { link: `<${GITHUB_API}/user/repos?page=2>; rel="next"` },
        },
        "/user/repos?page=2": { body: [repo("two")] },
      })
      const first = yield* GitHubService.use((service) =>
        service.repos.pipe(Stream.take(1), Stream.runCollect),
      ).pipe(Effect.provide(github(client, "t")))
      assert.lengthOf(first, 1)
      assert.lengthOf(yield* Ref.get(requests), 1)
    }),
  )

  it.effect("reports rate limiting with the reset time", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeGitHub({
        "/user": {
          status: 403,
          body: { message: "API rate limit exceeded" },
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1794300000" },
        },
      })
      const error = yield* GitHubService.use((service) => Effect.flip(service.whoami)).pipe(
        Effect.provide(github(client, "t")),
      )
      assert.strictEqual(error._tag, "GitHubRateLimited")
      assert.strictEqual(
        error._tag === "GitHubRateLimited" ? error.resetAt : null,
        new Date(1794300000 * 1000).toISOString(),
      )
    }),
  )

  it.effect("tells a missing token from a rejected one, and a 403 from a rate limit", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeGitHub({
        "/user": { status: 401, body: { message: "Bad credentials" } },
        "/repos/acme/secret": {
          status: 403,
          body: { message: "Resource not accessible" },
          headers: { "x-ratelimit-remaining": "42" },
        },
      })

      const missing = yield* GitHubService.use((service) => Effect.flip(service.whoami)).pipe(
        Effect.provide(github(client, undefined)),
      )
      assert.deepInclude(missing, { _tag: "GitHubNotAuthenticated", reason: "no_token" })

      const rejected = yield* GitHubService.use((service) => Effect.flip(service.whoami)).pipe(
        Effect.provide(github(client, "bad")),
      )
      assert.deepInclude(rejected, { _tag: "GitHubNotAuthenticated", reason: "rejected" })

      const forbidden = yield* GitHubService.use((service) =>
        Effect.flip(service.getRepo("acme/secret")),
      ).pipe(Effect.provide(github(client, "t")))
      assert.deepInclude(forbidden, {
        _tag: "GitHubRequestFailed",
        status: 403,
        detail: "Resource not accessible",
      })
    }),
  )

  it.effect("reports where the token comes from and who it signs in as", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeGitHub({
        "/user": { body: { login: "octo", name: "Octo Cat", avatar_url: "https://x/a.png" } },
      })
      const connection = GitHubService.use((service) => service.connection({ refresh: false }))

      assert.deepStrictEqual(yield* connection.pipe(Effect.provide(github(client, "t"))), {
        source: "environment",
        cliInstalled: false,
        user: { login: "octo", name: "Octo Cat", avatarUrl: "https://x/a.png" },
        problem: null,
      })

      // Without a token there is nobody to ask GitHub about.
      const before = (yield* Ref.get(requests)).length
      assert.deepStrictEqual(yield* connection.pipe(Effect.provide(github(client, undefined))), {
        source: null,
        cliInstalled: false,
        user: null,
        problem: null,
      })
      assert.strictEqual((yield* Ref.get(requests)).length, before)
    }),
  )

  it.effect("reports a token GitHub refuses as a problem, not a failure", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeGitHub({
        "/user": { status: 401, body: { message: "Bad credentials" } },
      })
      const connection = yield* GitHubService.use((service) =>
        service.connection({ refresh: true }),
      ).pipe(Effect.provide(github(client, "bad")))
      assert.strictEqual(connection.source, "environment")
      assert.isNull(connection.user)
      assert.include(connection.problem, "rejected the token")
    }),
  )

  it.effect("saves a token GitHub accepts, uses it first, and forgets it on request", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeGitHub({
        "/user": { body: { login: "octo", name: null, avatar_url: "https://x/a.png" } },
      })
      yield* Effect.gen(function* () {
        const service = yield* GitHubService
        const saved = yield* service.saveToken("pasted-token")
        assert.deepInclude(saved, { source: "token", problem: null })
        assert.strictEqual(saved.user?.login, "octo")
        assert.strictEqual((yield* Ref.get(requests)).at(-1)?.auth, "Bearer pasted-token")

        const removed = yield* service.removeToken
        assert.strictEqual(removed.source, "environment")
        assert.strictEqual((yield* Ref.get(requests)).at(-1)?.auth, "Bearer from-env")
      }).pipe(Effect.provide(github(client, "from-env")))
    }),
  )

  it.effect("does not save a token GitHub rejects", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeGitHub({
        "/user": { status: 401, body: { message: "Bad credentials" } },
      })
      yield* Effect.gen(function* () {
        const service = yield* GitHubService
        const error = yield* Effect.flip(service.saveToken("wrong"))
        assert.deepInclude(error, { _tag: "GitHubNotAuthenticated", reason: "rejected" })
        assert.isNull((yield* service.connection({ refresh: false })).source)
      }).pipe(Effect.provide(github(client, undefined)))
    }),
  )

  it.effect("reads public repositories and their branches without a token", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeGitHub({
        "/repos/acme/widgets/branches?per_page=100": {
          body: [
            { name: "main", commit: { sha: "abc" }, protected: true },
            { name: "dev", commit: { sha: "def" } },
          ],
        },
      })
      const branches = yield* GitHubService.use((service) =>
        service.listBranches("acme/widgets"),
      ).pipe(Effect.provide(github(client, undefined)))
      assert.deepStrictEqual(branches, [
        { name: "main", commitSha: "abc", protected: true },
        { name: "dev", commitSha: "def", protected: false },
      ])
      assert.isUndefined((yield* Ref.get(requests))[0]?.auth)
    }),
  )

  it.effect("rejects responses that don't match the expected shape", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeGitHub({ "/user": { body: { unexpected: true } } })
      const error = yield* GitHubService.use((service) => Effect.flip(service.whoami)).pipe(
        Effect.provide(github(client, "t")),
      )
      assert.strictEqual(error._tag, "GitHubRequestFailed")
    }),
  )
})

describe("cloning from GitHub", () => {
  /** Project and git services over a temp home, with a fake GitHub whose clone URL is local. */
  const services = (home: string, client: HttpClient.HttpClient, token: string | undefined) =>
    ProjectService.layer.pipe(
      Layer.provideMerge(GitService.layer),
      Layer.provideMerge(github(client, token)),
      Layer.provideMerge(offlineGitLab),
      Layer.provideMerge(DatabaseLive),
      Layer.provideMerge(ServerConfig.layer({ home, port: 0 })),
      Layer.provideMerge(NodeServices.layer),
    )

  it.live("clones with streamed progress into the data directory and adds the project", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const source = yield* tempRepo({ "README.md": "# widgets\n" })
      git(source, "branch", "feature/x")
      const { client } = yield* fakeGitHub({
        "/repos/acme/widgets": { body: repo("widgets", { clone_url: source }) },
      })

      const events = yield* ProjectService.use((projects) =>
        projects.cloneFromGitHub("acme/widgets").pipe(Stream.runCollect),
      ).pipe(Effect.provide(services(home, client, "secret-token")))

      const progress = events.filter((event: CloneEvent) => event._tag === "Progress")
      assert.isAbove(progress.length, 0)
      const last = events.at(-1)
      if (last?._tag !== "Cloned") return assert.fail("expected the clone to finish")

      const target = join(home, "repos", "acme", "widgets")
      assert.strictEqual(last.project.localPath.toLowerCase(), target.toLowerCase())
      assert.strictEqual(last.project.defaultBranch, "main")
      // The checkout follows the machine's own line-ending settings.
      assert.strictEqual(
        readFileSync(join(target, "README.md"), "utf8").replace(/\r\n/g, "\n"),
        "# widgets\n",
      )
      // Remote branches arrive with the clone, ready to start a session from.
      assert.include(git(target, "branch", "--all"), "remotes/origin/feature/x")
      // The token never lands in the clone's configuration.
      assert.notInclude(readFileSync(join(target, ".git", "config"), "utf8"), "secret-token")
      assert.notInclude(
        readFileSync(join(target, ".git", "config"), "utf8"),
        Buffer.from("x-access-token:secret-token").toString("base64"),
      )
    }),
  )

  it.live("refuses to clone over an existing folder or project", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const source = yield* tempRepo()
      const { client } = yield* fakeGitHub({
        "/repos/acme/widgets": { body: repo("widgets", { clone_url: source }) },
      })

      yield* Effect.gen(function* () {
        const projects = yield* ProjectService
        yield* projects.cloneFromGitHub("acme/widgets").pipe(Stream.runDrain)
        const again = yield* Effect.flip(
          projects.cloneFromGitHub("acme/widgets").pipe(Stream.runDrain),
        )
        assert.strictEqual(again._tag, "ProjectAlreadyExists")

        const project = (yield* projects.list)[0]
        if (project === undefined) return assert.fail("expected the cloned project")
        yield* projects.remove(project.id)
        // The project is gone but the folder stays; cloning again would overwrite it.
        const exists = yield* Effect.flip(
          projects.cloneFromGitHub("acme/widgets").pipe(Stream.runDrain),
        )
        assert.strictEqual(exists._tag, "CloneTargetExists")
      }).pipe(Effect.provide(services(home, client, undefined)))
    }),
  )

  it.live("cleans up after a failed clone and reports git's error", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const { client } = yield* fakeGitHub({
        "/repos/acme/broken": {
          body: repo("broken", { clone_url: join(home, "does-not-exist") }),
        },
      })

      const error = yield* ProjectService.use((projects) =>
        Effect.flip(projects.cloneFromGitHub("acme/broken").pipe(Stream.runDrain)),
      ).pipe(Effect.provide(services(home, client, undefined)))

      assert.strictEqual(error._tag, "GitCommandFailed")
      assert.isFalse(existsSync(join(home, "repos", "acme", "broken")))
    }),
  )

  it.live("surfaces GitHub errors before touching the disk", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const { client } = yield* fakeGitHub({})
      const error = yield* ProjectService.use((projects) =>
        Effect.flip(projects.cloneFromGitHub("acme/missing").pipe(Stream.runDrain)),
      ).pipe(Effect.provide(services(home, client, undefined)))
      assert.deepInclude(error, { _tag: "GitHubRequestFailed", status: 404 })
      assert.isFalse(existsSync(join(home, "repos", "acme")))
    }),
  )
})

describe("GitHubToken", () => {
  it.effect("the test layer hands out exactly the token it was given", () =>
    Effect.gen(function* () {
      const token = yield* GitHubToken.use((tokens) => tokens.get).pipe(
        Effect.provide(GitHubToken.layerTest("abc")),
      )
      assert.strictEqual(Option.map(token, Redacted.value).pipe(Option.getOrUndefined), "abc")
    }),
  )

  it.live("keeps a saved token in its own file, ahead of every other source", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const file = join(home, "github-token")
      yield* Effect.gen(function* () {
        const tokens = yield* GitHubToken
        yield* tokens.save(Redacted.make("saved-token"))
        assert.strictEqual(readFileSync(file, "utf8"), "saved-token")

        const resolved = yield* tokens.resolve
        assert.strictEqual(resolved.source, "token")
        assert.strictEqual(
          Option.map(resolved.token, Redacted.value).pipe(Option.getOrUndefined),
          "saved-token",
        )

        yield* tokens.clear
        assert.isFalse(existsSync(file))
        // Whatever this machine has (a gh login, GITHUB_TOKEN or nothing), it is not the saved one.
        assert.notStrictEqual((yield* tokens.resolve).source, "token")
        // Forgetting twice is not an error.
        yield* tokens.clear
      }).pipe(
        Effect.provide(
          GitHubToken.layer.pipe(
            Layer.provide(ServerConfig.layer({ home, port: 0 })),
            Layer.provide(NodeServices.layer),
          ),
        ),
      )
    }),
  )
})
