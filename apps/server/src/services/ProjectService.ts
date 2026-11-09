import {
  DEFAULT_TOOL_POLICY,
  PathNotFound,
  type Project,
  ProjectAlreadyExists,
  ProjectId,
  ProjectNotFound,
  ToolPolicy,
} from "@humanity/contracts"
import { Context, DateTime, Effect, FileSystem, Layer, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { randomUUID } from "node:crypto"
import { basename } from "node:path"
import { type GitError, GitService, parseGitHubFullName } from "./GitService.ts"

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
    /** Deletes Humanity's records for the project. The repository on disk is left alone. */
    readonly remove: (projectId: string) => Effect.Effect<void, ProjectNotFound>
  }
>()("humanity/ProjectService") {
  static readonly layer = Layer.effect(
    ProjectService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const fs = yield* FileSystem.FileSystem
      const git = yield* GitService

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

      const remove = Effect.fn("ProjectService.remove")(function* (projectId: string) {
        yield* get(projectId)
        yield* sql`DELETE FROM projects WHERE id = ${projectId}`.pipe(Effect.orDie)
      })

      return ProjectService.of({ list, get, addLocal, remove })
    }),
  )
}
