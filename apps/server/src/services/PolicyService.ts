import {
  FALLBACK_TOOL_MODE,
  type ProjectNotFound,
  resolveToolMode,
  setToolRule,
  type ToolMode,
  ToolPolicy,
} from "@humanity/contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { ProjectService } from "./ProjectService.ts"

/**
 * Per-project tool policies. Changes apply at once, also to agents already
 * running: every tool call asks `modeFor` at the moment it is made.
 */
export class PolicyService extends Context.Service<
  PolicyService,
  {
    readonly get: (projectId: string) => Effect.Effect<ToolPolicy, ProjectNotFound>
    readonly set: (
      projectId: string,
      policy: ToolPolicy,
    ) => Effect.Effect<ToolPolicy, ProjectNotFound>
    /** Sets a single tool to `auto`: the "always allow" choice on a confirmation. */
    readonly allowTool: (
      projectId: string,
      toolName: string,
    ) => Effect.Effect<void, ProjectNotFound>
    /**
     * The mode for a tool right now. Synchronous so the SDK's permission hook
     * can call it; a project whose policy is not loaded yet resolves to `confirm`.
     */
    readonly modeFor: (projectId: string, toolName: string) => ToolMode
  }
>()("humanity/PolicyService") {
  static readonly layer = Layer.effect(
    PolicyService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const projects = yield* ProjectService
      const cache = new Map<string, ToolPolicy>()
      const encode = Schema.encodeEffect(Schema.fromJsonString(ToolPolicy))

      const get = Effect.fn("PolicyService.get")(function* (projectId: string) {
        const project = yield* projects.get(projectId)
        cache.set(projectId, project.policy)
        return project.policy
      })

      const set = Effect.fn("PolicyService.set")(function* (projectId: string, policy: ToolPolicy) {
        yield* projects.get(projectId)
        const json = yield* encode(policy).pipe(Effect.orDie)
        yield* sql`UPDATE projects SET policy_json = ${json} WHERE id = ${projectId}`.pipe(
          Effect.orDie,
        )
        cache.set(projectId, policy)
        return policy
      })

      const allowTool = Effect.fn("PolicyService.allowTool")(function* (
        projectId: string,
        toolName: string,
      ) {
        const policy = yield* get(projectId)
        yield* set(projectId, setToolRule(policy, toolName, "auto"))
      })

      const modeFor = (projectId: string, toolName: string): ToolMode => {
        const policy = cache.get(projectId)
        return policy === undefined ? FALLBACK_TOOL_MODE : resolveToolMode(policy, toolName)
      }

      return PolicyService.of({ get, set, allowTool, modeFor })
    }),
  )
}
