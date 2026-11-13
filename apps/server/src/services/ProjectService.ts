import {
  Autonomy,
  type CloneEvent,
  CloneTargetExists,
  GITLAB_DEFAULT_HOST,
  PathNotFound,
  type Project,
  ProjectAlreadyExists,
  type ProjectIcon,
  ProjectId,
  ProjectNotFound,
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
import { type GitLabError, GitLabService } from "./GitLabService.ts"
import { type GitError, GitService, parseGitHubFullName, parseGitLabRemote } from "./GitService.ts"
import { iconCandidates, iconMimeType, MAX_ICON_BYTES, WORKSPACE_ROOTS } from "./projectIcon.ts"

const ProjectRow = Schema.Struct({
  id: ProjectId,
  name: Schema.String,
  local_path: Schema.String,
  github_full_name: Schema.NullOr(Schema.String),
  gitlab_host: Schema.NullOr(Schema.String),
  gitlab_full_path: Schema.NullOr(Schema.String),
  default_branch: Schema.String,
  default_autonomy: Schema.NullOr(Autonomy),
  created_at: Schema.String,
})

const toProject = (row: typeof ProjectRow.Type): Project => ({
  id: row.id,
  name: row.name,
  localPath: row.local_path,
  githubFullName: row.github_full_name,
  gitlab:
    row.gitlab_host === null || row.gitlab_full_path === null
      ? null
      : { host: row.gitlab_host, fullPath: row.gitlab_full_path },
  defaultBranch: row.default_branch,
  defaultAutonomy: row.default_autonomy,
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
    /**
     * Sets the autonomy the project's new threads start with; `null` follows
     * the human's default for every project.
     */
    readonly setDefaultAutonomy: (
      projectId: string,
      autonomy: Autonomy | null,
    ) => Effect.Effect<Project, ProjectNotFound>
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
    /**
     * Clones `group/name` of the connected GitLab instance into
     * `<home>/repos/<host>/<group>/<name>`, the same way.
     */
    readonly cloneFromGitLab: (
      fullPath: string,
    ) => Stream.Stream<
      CloneEvent,
      GitLabError | CloneTargetExists | ProjectAlreadyExists | PathNotFound | GitError
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
      const gitlab = yield* GitLabService

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

        const origin = yield* git.originUrl(localPath)
        // A remote is GitLab's when it is on gitlab.com or on the instance Humanity is connected to.
        const gitlabHosts = [(yield* gitlab.credentials).host, GITLAB_DEFAULT_HOST]
        const project: Project = {
          id: ProjectId.make(randomUUID()),
          name: basename(localPath),
          localPath,
          githubFullName: parseGitHubFullName(origin) ?? null,
          gitlab: parseGitLabRemote(origin, gitlabHosts) ?? null,
          defaultBranch: yield* git.defaultBranch(localPath),
          defaultAutonomy: null,
          createdAt: DateTime.formatIso(yield* DateTime.now),
        }
        yield* sql`
          INSERT INTO projects ${sql.insert({
            id: project.id,
            name: project.name,
            local_path: project.localPath,
            github_full_name: project.githubFullName,
            gitlab_host: project.gitlab?.host ?? null,
            gitlab_full_path: project.gitlab?.fullPath ?? null,
            default_branch: project.defaultBranch,
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

      const setDefaultAutonomy = Effect.fn("ProjectService.setDefaultAutonomy")(function* (
        projectId: string,
        autonomy: Autonomy | null,
      ) {
        const project = yield* get(projectId)
        yield* sql`UPDATE projects SET default_autonomy = ${autonomy} WHERE id = ${projectId}`.pipe(
          Effect.orDie,
        )
        return { ...project, defaultAutonomy: autonomy }
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
       * the token is never written into the clone's config or shown in `ps`. It
       * is only sent to URLs under `origin`, and `user` is the name that host
       * expects next to a token.
       */
      const credentialEnv = (
        origin: string,
        user: string,
        token: Option.Option<Redacted.Redacted<string>>,
      ) =>
        Option.match(token, {
          onNone: (): Record<string, string> => ({}),
          onSome: (value): Record<string, string> => ({
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: `http.${origin}/.extraheader`,
            GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(
              `${user}:${Redacted.value(value)}`,
            ).toString("base64")}`,
          }),
        })

      /** Clones `cloneUrl` into `target`, a folder under the repos directory that must not exist yet. */
      const cloneInto = Effect.fn("ProjectService.cloneInto")(function* (
        cloneUrl: string,
        target: string,
        env: Record<string, string>,
      ) {
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

        const progress = git
          .clone(cloneUrl, target, env)
          .pipe(Stream.map((line): CloneEvent => ({ _tag: "Progress", line })))
        const added = Stream.fromEffect(
          addLocal(target).pipe(Effect.map((project): CloneEvent => ({ _tag: "Cloned", project }))),
        )
        return Stream.concat(progress, added).pipe(
          // A failed or abandoned clone leaves nothing behind; the folder did not exist before.
          Stream.onExit((exit) =>
            exit._tag === "Success"
              ? Effect.void
              : fs.remove(target, { recursive: true }).pipe(Effect.ignore),
          ),
        )
      })

      const cloneFromGitHub = (fullName: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const repo = yield* github.getRepo(fullName)
            const env = credentialEnv("https://github.com", "x-access-token", yield* github.token)
            return yield* cloneInto(
              repo.cloneUrl,
              join(config.reposDir, repo.owner, repo.name),
              env,
            )
          }),
        )

      const cloneFromGitLab = (fullPath: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const repo = yield* gitlab.getRepo(fullPath)
            const { host, token } = yield* gitlab.credentials
            // `oauth2` is accepted with a personal access token and with the CLI's OAuth login.
            const env = credentialEnv(`https://${host}`, "oauth2", token)
            return yield* cloneInto(
              repo.cloneUrl,
              // A port's colon cannot be part of a folder name on Windows.
              join(config.reposDir, host.replace(":", "_"), ...repo.fullPath.split("/")),
              env,
            )
          }),
        )

      return ProjectService.of({
        list,
        get,
        addLocal,
        setDefaultAutonomy,
        remove,
        icon,
        cloneFromGitHub,
        cloneFromGitLab,
      })
    }),
  )
}
