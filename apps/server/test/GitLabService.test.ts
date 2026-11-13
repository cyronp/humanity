import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import type { CloneEvent } from "@humanity/contracts"
import { Effect, Layer, Option, Redacted, Ref, Stream } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseLive } from "../src/db/Database.ts"
import { ServerConfig } from "../src/ServerConfig.ts"
import { gitlabApi, GitLabService } from "../src/services/GitLabService.ts"
import { GitLabToken } from "../src/services/GitLabToken.ts"
import { GitService } from "../src/services/GitService.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { offlineGitHub, tempDir, tempRepo } from "./helpers.ts"

interface Reply {
  readonly status?: number
  readonly body: unknown
  readonly headers?: Record<string, string>
}

const API = gitlabApi("gitlab.com")

/** A fake GitLab: replies by full URL, and records each request's URL and auth header. */
const fakeGitLab = (routes: Record<string, Reply>) =>
  Effect.gen(function* () {
    const requests = yield* Ref.make<ReadonlyArray<{ url: string; auth: string | undefined }>>([])
    const client = HttpClient.make((request) =>
      Effect.gen(function* () {
        yield* Ref.update(requests, (all) => [
          ...all,
          { url: request.url, auth: request.headers["authorization"] },
        ])
        const reply = routes[request.url] ?? { status: 404, body: { message: "404 Not found" } }
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

const gitlab = (client: HttpClient.HttpClient, token: string | undefined) =>
  GitLabService.layer.pipe(
    Layer.provide(GitLabToken.layerTest(token)),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )

const repo = (path: string, extra: Record<string, unknown> = {}) => ({
  path_with_namespace: path,
  name: path.split("/").at(-1),
  description: null,
  visibility: "public",
  http_url_to_repo: `https://gitlab.com/${path}.git`,
  web_url: `https://gitlab.com/${path}`,
  last_activity_at: "2026-11-01T00:00:00Z",
  extra_field_ignored: true,
  ...extra,
})

const PAGE_1 = `${API}/projects?membership=true&archived=false&order_by=last_activity_at&per_page=100`
const USER = { username: "tanuki", name: "Tanuki", avatar_url: "https://x/a.png" }

describe("GitLabService", () => {
  it.effect("follows Link headers through every page of repositories", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeGitLab({
        [PAGE_1]: {
          body: [repo("acme/one"), repo("acme/tools/two", { visibility: "internal" })],
          headers: { link: `<${API}/projects?page=2>; rel="next"` },
        },
        [`${API}/projects?page=2`]: { body: [repo("acme/three", { visibility: "private" })] },
      })

      const repos = yield* GitLabService.use((service) => service.listRepos).pipe(
        Effect.provide(gitlab(client, "secret-token")),
      )

      assert.deepStrictEqual(
        repos.map((r) => [r.fullPath, r.private]),
        [
          ["acme/one", false],
          ["acme/tools/two", true],
          ["acme/three", true],
        ],
      )
      assert.deepStrictEqual(repos[0], {
        fullPath: "acme/one",
        name: "one",
        description: null,
        private: false,
        cloneUrl: "https://gitlab.com/acme/one.git",
        webUrl: "https://gitlab.com/acme/one",
        updatedAt: "2026-11-01T00:00:00Z",
      })
      const seen = yield* Ref.get(requests)
      assert.lengthOf(seen, 2)
      assert.isTrue(seen.every((request) => request.auth === "Bearer secret-token"))
    }),
  )

  it.effect("never follows a next page that leaves the instance", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeGitLab({
        [PAGE_1]: {
          body: [repo("acme/one")],
          headers: { link: '<https://evil.example/api/v4/projects?page=2>; rel="next"' },
        },
      })
      const repos = yield* GitLabService.use((service) => service.listRepos).pipe(
        Effect.provide(gitlab(client, "secret-token")),
      )
      assert.lengthOf(repos, 1)
      assert.deepStrictEqual(
        (yield* Ref.get(requests)).map((request) => request.url),
        [PAGE_1],
      )
    }),
  )

  it.effect("tells a missing token from a rejected one, a rate limit and other failures", () =>
    Effect.gen(function* () {
      const { client } = yield* fakeGitLab({
        [PAGE_1]: { status: 401, body: { message: "401 Unauthorized" } },
        [`${API}/projects/acme%2Fbusy`]: {
          status: 429,
          body: { message: "Retry later" },
          headers: { "ratelimit-reset": "1794300000" },
        },
        [`${API}/projects/acme%2Fsecret`]: {
          status: 403,
          body: { error: "insufficient_scope", error_description: "Needs the read_api scope" },
        },
      })

      const missing = yield* GitLabService.use((service) => Effect.flip(service.listRepos)).pipe(
        Effect.provide(gitlab(client, undefined)),
      )
      assert.deepInclude(missing, { _tag: "GitLabNotAuthenticated", reason: "no_token" })

      const rejected = yield* GitLabService.use((service) => Effect.flip(service.listRepos)).pipe(
        Effect.provide(gitlab(client, "bad")),
      )
      assert.deepInclude(rejected, { _tag: "GitLabNotAuthenticated", reason: "rejected" })

      const limited = yield* GitLabService.use((service) =>
        Effect.flip(service.getRepo("acme/busy")),
      ).pipe(Effect.provide(gitlab(client, "t")))
      assert.deepInclude(limited, {
        _tag: "GitLabRateLimited",
        resetAt: new Date(1794300000 * 1000).toISOString(),
      })

      const forbidden = yield* GitLabService.use((service) =>
        Effect.flip(service.getRepo("acme/secret")),
      ).pipe(Effect.provide(gitlab(client, "t")))
      assert.deepInclude(forbidden, {
        _tag: "GitLabRequestFailed",
        status: 403,
        detail: "Needs the read_api scope",
      })
    }),
  )

  it.effect("reports the instance, where the token comes from and who it signs in as", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* fakeGitLab({ [`${API}/user`]: { body: USER } })
      const connection = GitLabService.use((service) => service.connection({ refresh: false }))

      assert.deepStrictEqual(yield* connection.pipe(Effect.provide(gitlab(client, "t"))), {
        host: "gitlab.com",
        source: "environment",
        cliInstalled: false,
        user: { username: "tanuki", name: "Tanuki", avatarUrl: "https://x/a.png" },
        problem: null,
      })

      // Without a token nobody is asked anything.
      const before = (yield* Ref.get(requests)).length
      assert.deepStrictEqual(yield* connection.pipe(Effect.provide(gitlab(client, undefined))), {
        host: "gitlab.com",
        source: null,
        cliInstalled: false,
        user: null,
        problem: null,
      })
      assert.lengthOf(yield* Ref.get(requests), before)
    }),
  )

  it.effect("saves a token for a self-hosted instance only once that instance accepts it", () =>
    Effect.gen(function* () {
      const own = gitlabApi("git.acme.dev:8443")
      const { client, requests } = yield* fakeGitLab({
        [`${own}/user`]: { body: { username: "ana" } },
        [`${own}/projects/acme%2Fwidgets/repository/branches?per_page=100`]: {
          body: [
            { name: "main", commit: { id: "abc" }, protected: true },
            { name: "dev", commit: { id: "def" } },
          ],
        },
      })

      yield* Effect.gen(function* () {
        const service = yield* GitLabService
        // gitlab.com does not know this token: nothing is saved.
        const refused = yield* Effect.flip(service.saveToken("own-token", "gitlab.com"))
        assert.strictEqual(refused._tag, "GitLabRequestFailed")
        assert.strictEqual((yield* service.connection({ refresh: false })).source, null)

        const saved = yield* service.saveToken("own-token", "git.acme.dev:8443")
        assert.deepStrictEqual(saved, {
          host: "git.acme.dev:8443",
          source: "token",
          cliInstalled: false,
          user: { username: "ana", name: null, avatarUrl: null },
          problem: null,
        })

        // From then on every call goes to that instance, with that token.
        assert.deepStrictEqual(yield* service.listBranches("acme/widgets"), [
          { name: "main", commitSha: "abc", protected: true },
          { name: "dev", commitSha: "def", protected: false },
        ])
        const last = (yield* Ref.get(requests)).at(-1)
        assert.isTrue(last?.url.startsWith(`${own}/`))
        assert.strictEqual(last?.auth, "Bearer own-token")

        const removed = yield* service.removeToken
        assert.deepInclude(removed, { host: "gitlab.com", source: null, user: null })
      }).pipe(Effect.provide(gitlab(client, undefined)))
    }),
  )
})

describe("cloning from GitLab", () => {
  /** Project and git services over a temp home, with a fake GitLab whose clone URL is local. */
  const services = (home: string, client: HttpClient.HttpClient, token: string | undefined) =>
    ProjectService.layer.pipe(
      Layer.provideMerge(GitService.layer),
      Layer.provideMerge(gitlab(client, token)),
      Layer.provideMerge(offlineGitHub),
      Layer.provideMerge(DatabaseLive),
      Layer.provideMerge(ServerConfig.layer({ home, port: 0 })),
      Layer.provideMerge(NodeServices.layer),
    )

  it.live("clones a repository of a subgroup into the data directory and adds the project", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const source = yield* tempRepo({ "README.md": "# widgets\n" })
      const { client } = yield* fakeGitLab({
        [`${API}/projects/acme%2Ftools%2Fwidgets`]: {
          body: repo("acme/tools/widgets", { http_url_to_repo: source }),
        },
      })

      const events = yield* ProjectService.use((projects) =>
        projects.cloneFromGitLab("acme/tools/widgets").pipe(Stream.runCollect),
      ).pipe(Effect.provide(services(home, client, "secret-token")))

      assert.isAbove(events.filter((event: CloneEvent) => event._tag === "Progress").length, 0)
      const last = events.at(-1)
      if (last?._tag !== "Cloned") return assert.fail("expected the clone to finish")

      const target = join(home, "repos", "gitlab.com", "acme", "tools", "widgets")
      assert.strictEqual(last.project.localPath.toLowerCase(), target.toLowerCase())
      // The token never lands in the clone's configuration.
      const config = readFileSync(join(target, ".git", "config"), "utf8")
      assert.notInclude(config, "secret-token")
      assert.notInclude(config, Buffer.from("oauth2:secret-token").toString("base64"))
    }),
  )

  it.live("surfaces GitLab errors before touching the disk", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const { client } = yield* fakeGitLab({})
      const error = yield* ProjectService.use((projects) =>
        Effect.flip(projects.cloneFromGitLab("acme/missing").pipe(Stream.runDrain)),
      ).pipe(Effect.provide(services(home, client, undefined)))
      assert.deepInclude(error, { _tag: "GitLabRequestFailed", status: 404 })
      assert.isFalse(existsSync(join(home, "repos", "gitlab.com")))
    }),
  )
})

describe("GitLabToken", () => {
  it.live(
    "keeps a saved token and its instance in their own files, ahead of every other source",
    () =>
      Effect.gen(function* () {
        const home = yield* tempDir()
        yield* Effect.gen(function* () {
          const tokens = yield* GitLabToken
          yield* tokens.save(Redacted.make("saved-token"), "git.acme.dev")
          assert.strictEqual(readFileSync(join(home, "gitlab-token"), "utf8"), "saved-token")
          assert.strictEqual(readFileSync(join(home, "gitlab-host"), "utf8"), "git.acme.dev")

          const resolved = yield* tokens.resolve
          assert.strictEqual(resolved.source, "token")
          assert.strictEqual(resolved.host, "git.acme.dev")
          assert.strictEqual(
            Option.map(resolved.token, Redacted.value).pipe(Option.getOrUndefined),
            "saved-token",
          )

          yield* tokens.clear
          assert.isFalse(existsSync(join(home, "gitlab-token")))
          assert.isFalse(existsSync(join(home, "gitlab-host")))
          // Whatever this machine has (a glab login, GITLAB_TOKEN or nothing), it is not the saved one.
          assert.notStrictEqual((yield* tokens.resolve).source, "token")
          // Forgetting twice is not an error.
          yield* tokens.clear
        }).pipe(
          Effect.provide(
            GitLabToken.layer.pipe(
              Layer.provide(ServerConfig.layer({ home, port: 0 })),
              Layer.provide(NodeServices.layer),
            ),
          ),
        )
      }),
  )
})
