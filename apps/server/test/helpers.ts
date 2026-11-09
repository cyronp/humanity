import { NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { DatabaseLive } from "../src/db/Database.ts"
import { ServerConfig } from "../src/ServerConfig.ts"

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

/** Config, platform and an on-disk database rooted at `home`. */
export const baseLayer = (home: string) =>
  DatabaseLive.pipe(
    Layer.provideMerge(ServerConfig.layer({ home, port: 0 })),
    Layer.provideMerge(NodeServices.layer),
  )
