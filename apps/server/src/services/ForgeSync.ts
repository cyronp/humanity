import type { PullRequest, PullRequestFeed } from "@humanity/contracts"
import { Clock, Context, Effect, Fiber, Layer, Option, PubSub, Queue, Result, Stream } from "effect"
import { ForgeBackground } from "./ForgeGate.ts"
import { GitHubService } from "./GitHubService.ts"
import { GitLabService } from "./GitLabService.ts"

export type ForgeTarget =
  | { readonly forge: "github"; readonly fullName: string; readonly branch: string }
  | {
      readonly forge: "gitlab"
      readonly host: string
      readonly fullPath: string
      readonly branch: string
    }

/** An open pull request, or a branch that may get one any moment. */
const OPEN_POLL_MS = 60_000
/** A closed pull request rarely changes, and a failing forge is not asked faster. */
const SLOW_POLL_MS = 15 * 60_000
/** After a push the forge needs a moment to start the checks. */
const SETTLE_POLL_MS = 15_000
/** A burst of pushes asks the forge once. */
const MIN_SPACING_MS = 5_000
/** How often to look whether a token was connected meanwhile. No request leaves for it. */
const TOKEN_RECHECK_MS = 60_000

/** What a branch that the forge was never asked about looks like. */
export const EMPTY_FEED: PullRequestFeed = {
  pullRequest: null,
  checks: [],
  comments: [],
  fetchedAt: null,
  problem: null,
  pausedUntil: null,
  needsToken: false,
}

/**
 * How long until the forge is worth asking again, or `null` when it never is:
 * a merged pull request whose checks have finished stays as it is.
 */
export const nextPollDelay = (feed: Pick<PullRequestFeed, "pullRequest" | "checks">) => {
  const state = feed.pullRequest?.state
  if (state === "closed") return SLOW_POLL_MS
  if (state === "merged") {
    const running = feed.checks.some(
      (check) => check.status === "queued" || check.status === "running",
    )
    return running ? OPEN_POLL_MS : null
  }
  return OPEN_POLL_MS
}

interface Entry {
  readonly target: ForgeTarget
  readonly hub: PubSub.PubSub<PullRequestFeed>
  /** Cuts the wait short: something asked for a refresh. */
  readonly wakes: Queue.Queue<void>
  feed: PullRequestFeed | undefined
  watchers: number
  poller: Fiber.Fiber<unknown> | undefined
  /** When the forge is asked next; `null` when only a refresh will ask it. */
  dueAt: number | null
  lastAskedAt: number
  failures: number
  /** The human asked: this one may use the reserved quota. */
  manual: boolean
  /** The branch was just pushed: ask again soon, for the checks that follow. */
  settling: boolean
}

const keyOf = (target: ForgeTarget) =>
  target.forge === "github"
    ? `github\n${target.fullName.toLowerCase()}\n${target.branch}`
    : `gitlab\n${target.host.toLowerCase()}\n${target.fullPath.toLowerCase()}\n${target.branch}`

/**
 * The one place that follows pull requests. Each branch someone watches has a
 * single poller, shared by every browser tab and every session on that branch.
 * It asks the forge at a pace that fits the pull request's state, stops when
 * nobody watches, and keeps what it last heard so a returning watcher is
 * answered without a request.
 */
export class ForgeSync extends Context.Service<
  ForgeSync,
  {
    /** What is known about `target` right away, then every change, while the stream runs. */
    readonly watch: (target: ForgeTarget) => Stream.Stream<PullRequestFeed>
    /** The human asked for fresh data: ask the forge now. */
    readonly refresh: (target: ForgeTarget) => Effect.Effect<void>
    /** The branch changed on the forge (a push): ask again shortly. */
    readonly changed: (target: ForgeTarget) => Effect.Effect<void>
    /** Humanity just opened `pullRequest`: show it at once, then ask for its checks. */
    readonly opened: (target: ForgeTarget, pullRequest: PullRequest) => Effect.Effect<void>
  }
>()("humanity/ForgeSync") {
  static readonly layer = Layer.effect(
    ForgeSync,
    Effect.gen(function* () {
      const github = yield* GitHubService
      const gitlab = yield* GitLabService
      const scope = yield* Effect.scope
      const entries = new Map<string, Entry>()

      const entryOf = (target: ForgeTarget) =>
        Effect.gen(function* () {
          const key = keyOf(target)
          const existing = entries.get(key)
          if (existing !== undefined) return existing
          const hub = yield* PubSub.unbounded<PullRequestFeed>()
          const wakes = yield* Queue.sliding<void>(1)
          // Nothing may run between the lookup above and this `set`.
          const raced = entries.get(key)
          if (raced !== undefined) return raced
          const created: Entry = {
            target,
            hub,
            wakes,
            feed: undefined,
            watchers: 0,
            poller: undefined,
            dueAt: 0,
            lastAskedAt: 0,
            failures: 0,
            manual: false,
            settling: false,
          }
          entries.set(key, created)
          return created
        })

      const publish = (entry: Entry, feed: PullRequestFeed) =>
        Effect.suspend(() => {
          entry.feed = feed
          return PubSub.publish(entry.hub, feed)
        }).pipe(Effect.asVoid)

      const hasToken = (target: ForgeTarget) =>
        target.forge === "github"
          ? Effect.map(github.token, Option.isSome)
          : Effect.map(gitlab.credentials, ({ token }) => Option.isSome(token))

      /** The pull request of the branch with its checks and comments, in as few requests as it takes. */
      const ask = (target: ForgeTarget) =>
        Effect.gen(function* () {
          if (target.forge === "github") {
            const found = yield* github.findPullRequest(target.fullName, target.branch)
            if (Option.isNone(found)) return { pullRequest: null, checks: [], comments: [] }
            const pullRequest = found.value
            const [checks, comments] = yield* Effect.all(
              [
                github.checks(target.fullName, pullRequest.headSha),
                github.comments(target.fullName, pullRequest.number),
              ],
              { concurrency: 2 },
            )
            return { pullRequest, checks, comments }
          }
          const found = yield* gitlab.findMergeRequest(target.fullPath, target.branch)
          if (Option.isNone(found)) return { pullRequest: null, checks: [], comments: [] }
          const pullRequest = found.value
          const [checks, comments] = yield* Effect.all(
            [
              gitlab.checks(target.fullPath, pullRequest.number),
              gitlab.comments(target.fullPath, pullRequest),
            ],
            { concurrency: 2 },
          )
          return { pullRequest, checks, comments }
        })

      /** One turn of a poller: asks the forge, tells the watchers, and sets when to ask next. */
      const turn = (entry: Entry) =>
        Effect.gen(function* () {
          const manual = entry.manual
          const settling = entry.settling
          entry.manual = false
          entry.settling = false
          const now = yield* Clock.currentTimeMillis
          const known = entry.feed ?? EMPTY_FEED
          const authenticated = yield* hasToken(entry.target)

          // Without a token the forge allows very little: only the human's own refresh asks it.
          if (!authenticated && !manual) {
            entry.dueAt = now + TOKEN_RECHECK_MS
            if (entry.feed === undefined || !known.needsToken) {
              yield* publish(entry, { ...known, needsToken: true })
            }
            return
          }

          entry.lastAskedAt = now
          const answer = yield* ask(entry.target).pipe(
            // What a timer starts leaves the reserved quota to the human.
            Effect.provideService(ForgeBackground, !manual && !settling),
            Effect.result,
          )

          if (Result.isSuccess(answer)) {
            entry.failures = 0
            const feed: PullRequestFeed = {
              ...answer.success,
              fetchedAt: new Date(now).toISOString(),
              problem: null,
              pausedUntil: null,
              needsToken: !authenticated,
            }
            const delay = nextPollDelay(feed)
            entry.dueAt = !authenticated
              ? now + TOKEN_RECHECK_MS
              : settling
                ? now + Math.min(delay ?? SETTLE_POLL_MS, SETTLE_POLL_MS)
                : delay === null
                  ? null
                  : now + delay
            return yield* publish(entry, feed)
          }

          const error = answer.failure
          entry.failures += 1
          const resetAt =
            error._tag === "GitHubRateLimited" || error._tag === "GitLabRateLimited"
              ? error.resetAt
              : undefined
          const limited = resetAt !== undefined
          const resumeAt = typeof resetAt === "string" ? Date.parse(resetAt) : null
          entry.dueAt =
            resumeAt !== null && resumeAt > now
              ? // A second past the reset, so the forge's clock has passed it too.
                resumeAt + 1_000
              : now + Math.min(OPEN_POLL_MS * 2 ** (entry.failures - 1), SLOW_POLL_MS)
          yield* publish(entry, {
            ...known,
            problem: error.message,
            pausedUntil: limited ? new Date(entry.dueAt).toISOString() : null,
            needsToken: !authenticated,
          })
        })

      /** Asks when the entry is due, and waits for that or for a refresh otherwise. */
      const poll = (entry: Entry): Effect.Effect<never> =>
        Effect.gen(function* () {
          while (true) {
            const now = yield* Clock.currentTimeMillis
            if (entry.dueAt !== null && entry.dueAt <= now) {
              yield* turn(entry)
            } else if (entry.dueAt === null) {
              yield* Queue.take(entry.wakes)
            } else {
              yield* Queue.take(entry.wakes).pipe(Effect.timeoutOption(entry.dueAt - now))
            }
          }
        })

      const attach = (entry: Entry) =>
        Effect.gen(function* () {
          entry.watchers += 1
          if (entry.poller === undefined) {
            entry.poller = yield* Effect.forkIn(poll(entry), scope)
          }
        })

      const detach = (entry: Entry) =>
        Effect.suspend(() => {
          entry.watchers -= 1
          if (entry.watchers > 0 || entry.poller === undefined) return Effect.void
          // Nobody watches: stop asking. What is known stays for whoever comes back.
          const poller = entry.poller
          entry.poller = undefined
          return Fiber.interrupt(poller)
        })

      const watch = (target: ForgeTarget) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const entry = yield* entryOf(target)
            // Subscribe before reading what is known, so nothing falls in between.
            const subscription = yield* PubSub.subscribe(entry.hub)
            yield* Effect.acquireRelease(attach(entry), () => detach(entry))
            const updates = Stream.fromSubscription(subscription)
            return entry.feed === undefined
              ? updates
              : Stream.concat(Stream.make(entry.feed), updates)
          }),
        )

      /** Moves the next request to `dueAt` at the latest, and tells a waiting poller. */
      const hurry = (entry: Entry, dueAt: number) =>
        Effect.suspend(() => {
          entry.dueAt = entry.dueAt === null ? dueAt : Math.min(entry.dueAt, dueAt)
          return Queue.offer(entry.wakes, undefined)
        }).pipe(Effect.asVoid)

      const refresh = (target: ForgeTarget) =>
        Effect.gen(function* () {
          const entry = yield* entryOf(target)
          entry.manual = true
          yield* hurry(entry, 0)
        })

      const changed = (target: ForgeTarget) =>
        Effect.gen(function* () {
          const entry = yield* entryOf(target)
          entry.settling = true
          yield* hurry(entry, entry.lastAskedAt + MIN_SPACING_MS)
        })

      const opened = (target: ForgeTarget, pullRequest: PullRequest) =>
        Effect.gen(function* () {
          const entry = yield* entryOf(target)
          const now = yield* Clock.currentTimeMillis
          yield* publish(entry, {
            ...(entry.feed ?? EMPTY_FEED),
            pullRequest,
            checks: [],
            comments: [],
            fetchedAt: new Date(now).toISOString(),
            problem: null,
            pausedUntil: null,
          })
          entry.settling = true
          yield* hurry(entry, now + MIN_SPACING_MS)
        })

      return ForgeSync.of({ watch, refresh, changed, opened })
    }),
  )
}
