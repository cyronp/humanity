import { getSessionMessages, listSessions } from "@anthropic-ai/claude-agent-sdk"
import { Context, Data, Effect, Layer } from "effect"

export interface ClaudeConversation {
  readonly sessionId: string
  readonly title: string
  readonly gitBranch: string | undefined
  readonly createdAt: number | undefined
  readonly lastModified: number
}

export interface TestConversation extends ClaudeConversation {
  readonly entries: ReadonlyArray<unknown>
}

export class ClaudeHistoryUnavailable extends Data.TaggedError("ClaudeHistoryUnavailable")<{
  readonly reason: string
}> {}

const unavailable = (cause: unknown) =>
  new ClaudeHistoryUnavailable({
    reason: cause instanceof Error ? cause.message : String(cause),
  })

export class ClaudeHistory extends Context.Service<
  ClaudeHistory,
  {
    readonly list: (
      dir: string,
    ) => Effect.Effect<ReadonlyArray<ClaudeConversation>, ClaudeHistoryUnavailable>
    readonly messages: (
      sessionId: string,
      dir: string,
    ) => Effect.Effect<ReadonlyArray<unknown>, ClaudeHistoryUnavailable>
  }
>()("humanity/ClaudeHistory") {
  static readonly layer = Layer.succeed(ClaudeHistory, {
    list: (dir) =>
      Effect.tryPromise({
        try: () => listSessions({ dir, includeWorktrees: false, includeProgrammatic: false }),
        catch: unavailable,
      }).pipe(
        Effect.map((sessions) =>
          sessions.map((session): ClaudeConversation => ({
            sessionId: session.sessionId,
            title: session.customTitle ?? session.summary,
            gitBranch: session.gitBranch,
            createdAt: session.createdAt,
            lastModified: session.lastModified,
          })),
        ),
      ),
    messages: (sessionId, dir) =>
      Effect.tryPromise({
        try: () => getSessionMessages(sessionId, { dir }),
        catch: unavailable,
      }),
  })

  static readonly layerTest = (
    folders: () => Readonly<Record<string, ReadonlyArray<TestConversation>>> = () => ({}),
  ) =>
    Layer.succeed(ClaudeHistory, {
      list: (dir) => Effect.sync(() => folders()[dir] ?? []),
      messages: (sessionId, dir) =>
        Effect.sync(
          () =>
            (folders()[dir] ?? []).find((conversation) => conversation.sessionId === sessionId)
              ?.entries ?? [],
        ),
    })
}
