import { NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/http"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { DatabaseLive } from "../src/db/Database.ts"
import { ServerConfig } from "../src/ServerConfig.ts"
import { GitHubService } from "../src/services/GitHubService.ts"
import { GitHubToken } from "../src/services/GitHubToken.ts"
import { GitLabService } from "../src/services/GitLabService.ts"
import { GitLabToken } from "../src/services/GitLabToken.ts"

/** A temp directory removed when the scope closes. */
export const tempDir = (prefix = "humanity-test-") =>
  Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), prefix))),
    (dir) =>
      // git marks objects read-only; retry so Windows can release its handles.
      Effect.sync(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 })),
  )

/** Runs git with an argument array, isolated from the developer's own git config. */
export const git = (cwd: string, ...args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(cwd, ".no-global-gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Humanity Test",
      GIT_AUTHOR_EMAIL: "test@humanity.local",
      GIT_COMMITTER_NAME: "Humanity Test",
      GIT_COMMITTER_EMAIL: "test@humanity.local",
    },
  })

/** A temp repository on branch `main` with one commit. */
export const tempRepo = (files: Record<string, string> = { "README.md": "# fixture\n" }) =>
  Effect.gen(function* () {
    const dir = yield* tempDir("humanity-repo-")
    git(dir, "init", "--quiet", "--initial-branch=main")
    git(dir, "config", "user.name", "Humanity Test")
    git(dir, "config", "user.email", "test@humanity.local")
    git(dir, "config", "commit.gpgsign", "false")
    git(dir, "config", "core.autocrlf", "false")
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true })
      writeFileSync(join(dir, name), content)
    }
    git(dir, "add", "--all")
    git(dir, "commit", "--quiet", "--message", "initial")
    return dir
  })

/** Tests never reach the network: any request fails the test that made it. */
export const offlineHttp = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) => Effect.die(`unexpected network request: ${request.url}`)),
)

/** GitHub without a token and without a network, unless a test provides its own. */
export const offlineGitHub = GitHubService.layer.pipe(
  Layer.provide(GitHubToken.layerTest(undefined)),
  Layer.provide(offlineHttp),
)

/** GitLab likewise. */
export const offlineGitLab = GitLabService.layer.pipe(
  Layer.provide(GitLabToken.layerTest(undefined)),
  Layer.provide(offlineHttp),
)

/** Config, platform, an on-disk database rooted at `home`, and an offline GitHub and GitLab. */
export const baseLayer = (home: string) =>
  Layer.mergeAll(DatabaseLive, offlineGitHub, offlineGitLab).pipe(
    Layer.provideMerge(ServerConfig.layer({ home, port: 0 })),
    Layer.provideMerge(NodeServices.layer),
  )
