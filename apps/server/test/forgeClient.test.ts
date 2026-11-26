import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { makeForgeClients } from "../src/services/forgeClient.ts"
import { GITHUB_API, GitHubService } from "../src/services/GitHubService.ts"
import { GitHubToken } from "../src/services/GitHubToken.ts"
import { gitlabApi, GitLabService } from "../src/services/GitLabService.ts"
import { GitLabToken } from "../src/services/GitLabToken.ts"
import type { LoggedCommit } from "../src/services/gitParsers.ts"

const client = (routes: Record<string, unknown>) =>
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        request.url in routes
          ? new Response(JSON.stringify(routes[request.url]), {
              headers: { "content-type": "application/json" },
            })
          : new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      ),
    ),
  )

const forges = (token: string | undefined, routes: Record<string, unknown> = {}) => {
  const http = Layer.succeed(HttpClient.HttpClient, client(routes))
  return Layer.mergeAll(
    GitHubService.layer.pipe(Layer.provide(GitHubToken.layerTest(token)), Layer.provide(http)),
    GitLabService.layer.pipe(Layer.provide(GitLabToken.layerTest(token)), Layer.provide(http)),
  )
}

const commit = (hash: string, authorEmail: string): LoggedCommit => ({
  hash,
  shortHash: hash.slice(0, 7),
  subject: "change",
  author: "Ana",
  authorEmail,
  committedAt: "2026-11-20T10:00:00Z",
  files: 1,
  insertions: 1,
  deletions: 0,
})

const GITHUB = { forge: "github", fullName: "acme/app" } as const
const GITLAB = { forge: "gitlab", host: "gitlab.com", fullPath: "acme/app" } as const

describe("forge clients", () => {
  it.effect("refuses a rebase merge on GitLab only", () =>
    Effect.gen(function* () {
      const forgeOf = yield* makeForgeClients
      assert.isNull(forgeOf(GITHUB).mergeRefusal("rebase"))
      assert.isNull(forgeOf(GITLAB).mergeRefusal("squash"))
      assert.match(forgeOf(GITLAB).mergeRefusal("rebase") ?? "", /own merge method/)
    }).pipe(Effect.provide(forges("t"))),
  )

  it.effect("gives git the token of the forge, and none for another GitLab host", () =>
    Effect.gen(function* () {
      const forgeOf = yield* makeForgeClients
      const onGitHub = yield* forgeOf(GITHUB).gitEnv
      assert.include(onGitHub["GIT_CONFIG_KEY_0"], "https://github.com/")
      const onGitLab = yield* forgeOf(GITLAB).gitEnv
      assert.include(onGitLab["GIT_CONFIG_KEY_0"], "https://gitlab.com/")
      assert.deepStrictEqual(yield* forgeOf({ ...GITLAB, host: "git.acme.dev" }).gitEnv, {})
    }).pipe(Effect.provide(forges("t"))),
  )

  it.effect("passes no credentials without a token", () =>
    Effect.gen(function* () {
      const forgeOf = yield* makeForgeClients
      assert.deepStrictEqual(yield* forgeOf(GITHUB).gitEnv, {})
      assert.deepStrictEqual(yield* forgeOf(GITLAB).gitEnv, {})
    }).pipe(Effect.provide(forges(undefined))),
  )

  it.effect("finds GitHub pictures of pushed commits by their sha", () =>
    Effect.gen(function* () {
      const forgeOf = yield* makeForgeClients
      const found = yield* forgeOf(GITHUB).findPictures({
        upstream: "origin/topic",
        commits: [commit("a1", "ana@example.com"), commit("b2", "ana@example.com")],
        unpushed: new Set(["a1"]),
        known: () => false,
      })
      assert.deepStrictEqual(found, {
        bySha: [["b2", "https://avatars.example/ana"]],
        byEmail: [["ana@example.com", "https://avatars.example/ana"]],
      })
      assert.strictEqual(
        forgeOf(GITHUB).fallbackPicture("ana@users.noreply.github.com"),
        "https://github.com/ana.png",
      )
    }).pipe(
      Effect.provide(
        forges("t", {
          [`${GITHUB_API}/repos/acme/app/commits?sha=topic&per_page=1`]: [
            {
              sha: "b2",
              commit: { author: { email: "ana@example.com" } },
              author: { login: "ana", avatar_url: "https://avatars.example/ana" },
            },
          ],
        }),
      ),
    ),
  )

  it.effect("looks up GitLab pictures by email, once each, skipping known ones", () =>
    Effect.gen(function* () {
      const forgeOf = yield* makeForgeClients
      const found = yield* forgeOf(GITLAB).findPictures({
        upstream: null,
        commits: [
          commit("a1", "Ana@Example.com"),
          commit("b2", "ana@example.com"),
          commit("c3", "bo@example.com"),
        ],
        unpushed: new Set(),
        known: (email) => email === "bo@example.com",
      })
      assert.deepStrictEqual(found, {
        bySha: [],
        byEmail: [["ana@example.com", "https://gitlab.example/ana.png"]],
      })
      assert.isNull(forgeOf(GITLAB).fallbackPicture("ana@users.noreply.github.com"))
    }).pipe(
      Effect.provide(
        forges("t", {
          [`${gitlabApi("gitlab.com")}/avatar?email=ana%40example.com&size=48`]: {
            avatar_url: "https://gitlab.example/ana.png",
          },
        }),
      ),
    ),
  )
})
