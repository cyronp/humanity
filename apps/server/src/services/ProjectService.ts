import {
  type CloneEvent,
  CloneTargetExists,
  DEFAULT_TOOL_POLICY,
  PathNotFound,
  type Project,
  ProjectAlreadyExists,
  type ProjectIcon,
  ProjectId,
  ProjectNotFound,
  ToolPolicy,
} from "@humanity/contracts"
import {
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Redacted,
  Schema,
  Stream,
} from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { randomUUID } from "node:crypto"
import { basename, dirname, join } from "node:path"
import { isInsideDir } from "../paths.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { type GitHubError, GitHubService } from "./GitHubService.ts"
import { type GitError, GitService, parseGitHubFullName } from "./GitService.ts"
import { iconCandidates, iconMimeType, MAX_ICON_BYTES, WORKSPACE_ROOTS } from "./projectIcon.ts"

const ProjectRow = Schema.Struct({
  id: ProjectId,
  name: Schema.String,
  local_path: Schema.String,
  github_full_name: Schema.NullOr(Schema.String),
  default_branch: Schema.String,
  policy_json: Schema.fromJsonString(ToolPolicy),
  created_at: Schema.String,
})

const toProject = (row: typeof ProjectRow.Type): Project => ({
  id: row.id,
  name: row.name,
  localPath: row.local_path,
  githubFullName: row.github_full_name,
  defaultBranch: row.default_branch,
  policy: row.policy_json,
  createdAt: row.created_at,
})

// Windows and default macOS file systems are case-insensitive.
const samePath = (a: string, b: string) =>
  process.platform === "linux" ? a === b : a.toLowerCase() === b.toLowerCase()

export class ProjectService extends Context.Service<
  ProjectService,
  {
    readonly list: Effect.Effect<ReadonlyArray<Project>>
    readonly get: (projectId: string) => Effect.Effect<Project, ProjectNotFound>
    /** Registers an existing local repository. Nothing inside it is modified. */
    readonly addLocal: (
      path: string,
    ) => Effect.Effect<Project, PathNotFound | GitError | ProjectAlreadyExists>
    /** Deletes Humanity's records and session worktrees. The repository itself is left alone. */
    readonly remove: (projectId: string) => Effect.Effect<void, ProjectNotFound>
    /**
     * The project's favicon, looked up in the usual places of its working copy
     * (including `apps/*` and `packages/*` in a monorepo). Only reads.
     */
    readonly icon: (projectId: string) => Effect.Effect<ProjectIcon | null, ProjectNotFound>
    /**
     * Clones `owner/repo` into `<home>/repos/<owner>/<repo>`, streaming git's
     * progress, and adds the clone as a project when it finishes.
     */
    readonly cloneFromGitHub: (
      fullName: string,
    ) => Stream.Stream<
      CloneEvent,
      GitHubError | CloneTargetExists | ProjectAlreadyExists | PathNotFound | GitError
    >
  }
>()("humanity/ProjectService") {
  static readonly layer = Layer.effect(
    ProjectService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const fs = yield* FileSystem.FileSystem
      const git = yield* GitService
      const config = yield* ServerConfig
      const github = yield* GitHubService

      const selectAll = SqlSchema.findAll({
        Request: Schema.Void,
        Result: ProjectRow,
        execute: () => sql`SELECT * FROM projects ORDER BY created_at DESC`,
      })
      const selectById = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: ProjectRow,
        execute: (id) => sql`SELECT * FROM projects WHERE id = ${id}`,
      })

      const list = selectAll().pipe(
        Effect.map((rows) => rows.map(toProject)),
        Effect.orDie,
        Effect.withSpan("ProjectService.list"),
      )

      const get = Effect.fn("ProjectService.get")(function* (projectId: string) {
        const row = yield* selectById(projectId).pipe(Effect.orDie)
        if (Option.isNone(row)) return yield* new ProjectNotFound({ projectId })
        return toProject(row.value)
      })

      const addLocal = Effect.fn("ProjectService.addLocal")(function* (path: string) {
        const trimmed = path.trim()
        const isDirectory = yield* fs.stat(trimmed).pipe(
          Effect.map((info) => info.type === "Directory"),
          Effect.catch(() => Effect.succeed(false)),
        )
        if (trimmed === "" || !isDirectory) return yield* new PathNotFound({ path: trimmed })

        const localPath = yield* git.repositoryRoot(trimmed)
        const existing = yield* list
        if (existing.some((project) => samePath(project.localPath, localPath))) {
          return yield* new ProjectAlreadyExists({ localPath })
        }

        const project: Project = {
          id: ProjectId.make(randomUUID()),
          name: basename(localPath),
          localPath,
          githubFullName: parseGitHubFullName(yield* git.originUrl(localPath)) ?? null,
          defaultBranch: yield* git.defaultBranch(localPath),
          policy: DEFAULT_TOOL_POLICY,
          createdAt: DateTime.formatIso(yield* DateTime.now),
        }
        const policyJson = yield* Schema.encodeEffect(Schema.fromJsonString(ToolPolicy))(
          project.policy,
        ).pipe(Effect.orDie)

        yield* sql`
          INSERT INTO projects ${sql.insert({
            id: project.id,
            name: project.name,
            local_path: project.localPath,
            github_full_name: project.githubFullName,
            default_branch: project.defaultBranch,
            policy_json: policyJson,
            created_at: project.createdAt,
          })}
        `.pipe(Effect.orDie)

        return project
      })

      const sessionWorktrees = SqlSchema.findAll({
        Request: Schema.String,
        Result: Schema.Struct({ id: Schema.String, worktree_path: Schema.String }),
        execute: (projectId) =>
          sql`SELECT id, worktree_path FROM sessions WHERE project_id = ${projectId}`,
      })

      const remove = Effect.fn("ProjectService.remove")(function* (projectId: string) {
        const project = yield* get(projectId)
        // Only worktrees Humanity created under its data directory are removed.
        const worktrees = yield* sessionWorktrees(projectId).pipe(Effect.orDie)
        yield* Effect.forEach(
          worktrees.filter((row) => isInsideDir(config.worktreesDir, row.worktree_path)),
          (row) =>
            git.worktreeRemove(project.localPath, row.worktree_path).pipe(
              Effect.catch((error) =>
                Effect.logWarning("could not remove a session worktree", {
                  path: row.worktree_path,
                  error: error.message,
                }),
              ),
            ),
          { discard: true },
        )
        yield* sql`DELETE FROM projects WHERE id = ${projectId}`.pipe(Effect.orDie)
        // The database rows go with the project; the attached files are Humanity's to delete too.
        yield* Effect.forEach(
          worktrees,
          (row) => {
            const dir = join(config.attachmentsDir, row.id)
            return isInsideDir(config.attachmentsDir, dir)
              ? fs.remove(dir, { recursive: true }).pipe(Effect.ignore)
              : Effect.void
          },
          { discard: true },
        )
      })

      /** The icon file at `relativePath`, if it is a small image inside the repository. */
      const readIcon = (root: string, relativePath: string) =>
        Effect.gen(function* () {
          const mimeType = iconMimeType(relativePath)
          if (mimeType === undefined) return undefined
          const path = join(root, ...relativePath.split("/"))
          const info = yield* fs.stat(path).pipe(Effect.option)
          if (Option.isNone(info) || info.value.type !== "File") return undefined
          if (Number(info.value.size) > MAX_ICON_BYTES) return undefined
          // A symlink must not lead the daemon to read files outside the repository.
          const real = yield* fs.realPath(path).pipe(Effect.option)
          const realRoot = yield* fs.realPath(root).pipe(Effect.option)
          if (
            Option.isNone(real) ||
            Option.isNone(realRoot) ||
            !isInsideDir(realRoot.value, real.value)
          ) {
            return undefined
          }
          const bytes = yield* fs.readFile(path).pipe(Effect.option)
          if (Option.isNone(bytes)) return undefined
          return { mimeType, base64: Buffer.from(bytes.value).toString("base64") }
        })

      const workspaceNames = (root: string, folder: string) =>
        fs.readDirectory(join(root, folder)).pipe(
          Effect.map((names) => names.slice(0, 50)),
          Effect.orElseSucceed((): ReadonlyArray<string> => []),
        )

      const icon = Effect.fn("ProjectService.icon")(function* (projectId: string) {
        const project = yield* get(projectId)
        const workspaces = yield* Effect.forEach(WORKSPACE_ROOTS, (root) =>
          Effect.map(workspaceNames(project.localPath, root), (names) => ({ root, names })),
        )
        for (const candidate of iconCandidates(workspaces)) {
          const found = yield* readIcon(project.localPath, candidate)
          if (found !== undefined) return found
        }
        return null
      })

      /**
       * Git reads this header from the environment of the one clone process, so
       * the token is never written into the clone's config or shown in `ps`.
       */
      const credentialEnv = (token: Option.Option<Redacted.Redacted<string>>) =>
        Option.match(token, {
          onNone: (): Record<string, string> => ({}),
          onSome: (value): Record<string, string> => ({
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
            GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(
              `x-access-token:${Redacted.value(value)}`,
            ).toString("base64")}`,
          }),
        })

      const cloneFromGitHub = (fullName: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const repo = yield* github.getRepo(fullName)
            const target = join(config.reposDir, repo.owner, repo.name)
            if (!isInsideDir(config.reposDir, target)) {
              return yield* new CloneTargetExists({ path: target })
            }
            const projects = yield* list
            if (projects.some((project) => samePath(project.localPath, target))) {
              return yield* new ProjectAlreadyExists({ localPath: target })
            }
            if (yield* fs.exists(target).pipe(Effect.orElseSucceed(() => true))) {
              return yield* new CloneTargetExists({ path: target })
            }
            yield* fs.makeDirectory(dirname(target), { recursive: true }).pipe(Effect.orDie)
            const env = credentialEnv(yield* github.token)

            const progress = git
              .clone(repo.cloneUrl, target, env)
              .pipe(Stream.map((line): CloneEvent => ({ _tag: "Progress", line })))
            const added = Stream.fromEffect(
              addLocal(target).pipe(
                Effect.map((project): CloneEvent => ({ _tag: "Cloned", project })),
              ),
            )
            return Stream.concat(progress, added).pipe(
              // A failed or abandoned clone leaves nothing behind; the folder did not exist before.
              Stream.onExit((exit) =>
                exit._tag === "Success"
                  ? Effect.void
                  : fs.remove(target, { recursive: true }).pipe(Effect.ignore),
              ),
            )
          }),
        )

      return ProjectService.of({ list, get, addLocal, remove, icon, cloneFromGitHub })
    }),
  )
}
