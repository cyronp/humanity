import { getSessionMessages, listSessions } from "@anthropic-ai/claude-agent-sdk"
import { Context, Data, Effect, Layer } from "effect"

export interface ClaudeConversation {
  readonly sessionId: string
  /** The `/rename` title, Claude Code's own summary, or the first prompt. */
  readonly title: string
  readonly gitBranch: string | undefined
  /** Milliseconds since the epoch. */
  readonly createdAt: number | undefined
  /** When the transcript last changed, in milliseconds since the epoch. */
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

/**
 * Reads the conversations the human had in the Claude Code CLI, from its own
 * transcripts (`~/.claude/projects`, or `CLAUDE_CONFIG_DIR`). Read only.
 */
export class ClaudeHistory extends Context.Service<
  ClaudeHistory,
  {
    /**
     * The conversations held in exactly this folder, newest first. Programmatic
     * runs (`claude -p`, the Agent SDK, Humanity's own threads) are left out,
     * like Claude Code's `/resume` leaves them out.
     */
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

  /** The conversations `folders` returns when asked, per folder, for tests. */
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
