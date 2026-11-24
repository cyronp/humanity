import {
  Autonomy,
  type CloneEvent,
  CloneTargetExists,
  DEFAULT_PROJECT_SETTINGS,
  type FolderEntry,
  GITLAB_DEFAULT_HOST,
  PathNotFound,
  type Project,
  ProjectAlreadyExists,
  type ProjectIcon,
  ProjectId,
  ProjectNotFound,
  ProjectSettings,
  StoredProjectSettings,
} from "@humanity/contracts"
import { Context, DateTime, Effect, FileSystem, Layer, Option, Schema, Stream } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import { expandHome, isInsideDir } from "../paths.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { type GitHubError, GitHubService } from "./GitHubService.ts"
import { type GitLabError, GitLabService } from "./GitLabService.ts"
import { credentialEnv } from "./gitCredentials.ts"
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
  settings_json: Schema.NullOr(Schema.String),
  created_at: Schema.String,
})

const SettingsJson = Schema.fromJsonString(StoredProjectSettings)
const decodeSettings = Schema.decodeUnknownOption(SettingsJson)
const encodeSettings = Schema.encodeSync(Schema.fromJsonString(ProjectSettings))

const readSettings = (json: string | null): ProjectSettings =>
  json === null
    ? DEFAULT_PROJECT_SETTINGS
    : decodeSettings(json).pipe(Option.getOrElse(() => DEFAULT_PROJECT_SETTINGS))

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
  settings: readSettings(row.settings_json),
  createdAt: row.created_at,
})

const MAX_FOLDERS = 50
const MAX_CANDIDATES = 500

const samePath = (a: string, b: string) =>
  process.platform === "linux" ? a === b : a.toLowerCase() === b.toLowerCase()

export class ProjectService extends Context.Service<
  ProjectService,
  {
    readonly list: Effect.Effect<ReadonlyArray<Project>>
    readonly get: (projectId: string) => Effect.Effect<Project, ProjectNotFound>
    readonly addLocal: (
      path: string,
    ) => Effect.Effect<Project, PathNotFound | GitError | ProjectAlreadyExists>
    readonly listFolders: (
      folder: string,
      prefix: string,
    ) => Effect.Effect<ReadonlyArray<FolderEntry>>
    readonly setDefaultAutonomy: (
      projectId: string,
      autonomy: Autonomy | null,
    ) => Effect.Effect<Project, ProjectNotFound>
    readonly rename: (projectId: string, name: string) => Effect.Effect<Project, ProjectNotFound>
    readonly setSettings: (
      projectId: string,
      settings: ProjectSettings,
    ) => Effect.Effect<Project, ProjectNotFound>
    readonly remove: (projectId: string) => Effect.Effect<void, ProjectNotFound>
    readonly icon: (projectId: string) => Effect.Effect<ProjectIcon | null, ProjectNotFound>
    readonly cloneFromGitHub: (
      fullName: string,
    ) => Stream.Stream<
      CloneEvent,
      GitHubError | CloneTargetExists | ProjectAlreadyExists | PathNotFound | GitError
    >
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

      const listFolders = Effect.fn("ProjectService.listFolders")(function* (
        folder: string,
        prefix: string,
      ) {
        const dir = expandHome(folder, homedir())
        const wanted = prefix.toLowerCase()
        const hidden = prefix.startsWith(".")
        const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))
        const candidates = names
          .filter(
            (name) => name.toLowerCase().startsWith(wanted) && (hidden || !name.startsWith(".")),
          )
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }))
          .slice(0, MAX_CANDIDATES)
        const isFolder = (name: string) =>
          fs.stat(join(dir, name)).pipe(
            Effect.map((info) => info.type === "Directory"),
            Effect.orElseSucceed(() => false),
          )
        const folders = yield* Effect.filter(candidates, isFolder, { concurrency: 16 })
        return yield* Effect.forEach(
          folders.slice(0, MAX_FOLDERS),
          (name) =>
            fs.exists(join(dir, name, ".git")).pipe(
              Effect.orElseSucceed(() => false),
              Effect.map((isRepository): FolderEntry => ({ name, isRepository })),
            ),
          { concurrency: 16 },
        )
      })

      const addLocal = Effect.fn("ProjectService.addLocal")(function* (path: string) {
        const trimmed = expandHome(path.trim(), homedir())
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
        const gitlabHosts = [(yield* gitlab.credentials).host, GITLAB_DEFAULT_HOST]
        const project: Project = {
          id: ProjectId.make(randomUUID()),
          name: basename(localPath),
          localPath,
          githubFullName: parseGitHubFullName(origin) ?? null,
          gitlab: parseGitLabRemote(origin, gitlabHosts) ?? null,
          defaultBranch: yield* git.defaultBranch(localPath),
          defaultAutonomy: null,
          settings: DEFAULT_PROJECT_SETTINGS,
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

      const rename = Effect.fn("ProjectService.rename")(function* (
        projectId: string,
        name: string,
      ) {
        const project = yield* get(projectId)
        const trimmed = name.trim()
        if (trimmed === "" || trimmed === project.name) return project
        yield* sql`UPDATE projects SET name = ${trimmed} WHERE id = ${projectId}`.pipe(Effect.orDie)
        return { ...project, name: trimmed }
      })

      const setSettings = Effect.fn("ProjectService.setSettings")(function* (
        projectId: string,
        settings: ProjectSettings,
      ) {
        const project = yield* get(projectId)
        const setupScript = settings.setupScript?.trim() ? settings.setupScript : null
        const checkScript = settings.checkScript?.trim() ? settings.checkScript : null
        const next: ProjectSettings = { ...settings, setupScript, checkScript }
        yield* sql`UPDATE projects SET settings_json = ${encodeSettings(next)} WHERE id = ${projectId}`.pipe(
          Effect.orDie,
        )
        return { ...project, settings: next }
      })

      const remove = Effect.fn("ProjectService.remove")(function* (projectId: string) {
        const project = yield* get(projectId)
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

      const readIcon = (root: string, relativePath: string) =>
        Effect.gen(function* () {
          const mimeType = iconMimeType(relativePath)
          if (mimeType === undefined) return undefined
          const path = join(root, ...relativePath.split("/"))
          const info = yield* fs.stat(path).pipe(Effect.option)
          if (Option.isNone(info) || info.value.type !== "File") return undefined
          if (Number(info.value.size) > MAX_ICON_BYTES) return undefined
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
            const env = credentialEnv(`https://${host}`, "oauth2", token)
            return yield* cloneInto(
              repo.cloneUrl,
              join(config.reposDir, host.replace(":", "_"), ...repo.fullPath.split("/")),
              env,
            )
          }),
        )

      return ProjectService.of({
        list,
        get,
        addLocal,
        listFolders,
        setDefaultAutonomy,
        rename,
        setSettings,
        remove,
        icon,
        cloneFromGitHub,
        cloneFromGitLab,
      })
    }),
  )
}
