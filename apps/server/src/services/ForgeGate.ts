import { Clock, Context, Effect, Option, Redacted, Semaphore } from "effect"
import { createHash } from "node:crypto"

/**
 * Whether the request at hand was started by a timer instead of the human.
 * Background requests stop while the last tenth of the quota is left, so a
 * click still gets an answer.
 */
export const ForgeBackground = Context.Reference<boolean>("humanity/ForgeBackground", {
  defaultValue: () => false,
})

/** What a forge said is left of its rate limit. */
export interface ForgeQuota {
  readonly limit: number
  readonly remaining: number
  /** Epoch milliseconds. */
  readonly resetAt: number
}

/** A JSON answer and its `Link` header, as far as a decoder and a pager need them. */
export interface ForgePage {
  readonly status: number
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly json: Effect.Effect<unknown, unknown>
}

interface Remembered {
  readonly etag: string
  readonly json: unknown
  readonly link: string | undefined
}

/** The share of the quota kept for requests the human asks for. */
const RESERVE = 0.1
/** How long to stay away after a limit that names no time, doubling up to the cap. */
const FALLBACK_PAUSE_MS = 30_000
const MAX_FALLBACK_PAUSE_MS = 15 * 60_000
/** Forges penalise bursts of concurrent requests. */
const MAX_CONCURRENT = 8
const MAX_REMEMBERED = 300

/** Tells one token's quota from another's without keeping the token itself as a key. */
export const forgeScope = (host: string, token: Option.Option<Redacted.Redacted<string>>): string =>
  Option.match(token, {
    onNone: () => `${host}\nanonymous`,
    onSome: (value) =>
      `${host}\n${createHash("sha256").update(Redacted.value(value)).digest("hex").slice(0, 16)}`,
  })

/** The quota in `<prefix>limit`, `<prefix>remaining` and `<prefix>reset` (epoch seconds) headers. */
export const quotaFromHeaders = (
  headers: Readonly<Record<string, string | undefined>>,
  prefix: string,
): ForgeQuota | undefined => {
  const limit = Number(headers[`${prefix}limit`])
  const remaining = Number(headers[`${prefix}remaining`])
  const reset = Number(headers[`${prefix}reset`])
  if (
    headers[`${prefix}limit`] === undefined ||
    headers[`${prefix}remaining`] === undefined ||
    !Number.isFinite(limit) ||
    limit <= 0 ||
    !Number.isFinite(remaining) ||
    remaining < 0 ||
    !Number.isFinite(reset) ||
    reset <= 0
  ) {
    return undefined
  }
  return { limit, remaining, resetAt: reset * 1000 }
}

/** When a `Retry-After` header (seconds, or a date) lets requests resume. */
export const retryAfter = (value: string | undefined, now: number): number | undefined => {
  if (value === undefined) return undefined
  const text = value.trim()
  if (/^\d+$/.test(text)) return now + Number(text) * 1000
  const date = Date.parse(text)
  return Number.isFinite(date) && date > now ? date : undefined
}

/**
 * What stands between a forge service and the network: the quota each token
 * has left, a pause after the forge refused one, a cap on concurrent requests,
 * and the answers worth revalidating instead of fetching again.
 */
export const makeForgeGate = Effect.gen(function* () {
  const slots = yield* Semaphore.make(MAX_CONCURRENT)
  const quotas = new Map<string, ForgeQuota>()
  const pauses = new Map<string, { readonly until: number; readonly attempt: number }>()
  const remembered = new Map<string, Remembered>()

  return {
    /** When requests of `scope` may resume, or `null` when one may go now. */
    pausedUntil: (scope: string): Effect.Effect<number | null> =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const pause = pauses.get(scope)
        if (pause !== undefined && pause.until > now) return pause.until
        const quota = quotas.get(scope)
        if (quota === undefined || quota.resetAt <= now) return null
        const floor = (yield* ForgeBackground) ? Math.max(1, quota.limit * RESERVE) : 1
        return quota.remaining < floor ? quota.resetAt : null
      }),

    /** Notes the quota an answer reported. */
    observe: (scope: string, quota: ForgeQuota | undefined): Effect.Effect<void> =>
      Effect.sync(() => {
        if (quota === undefined) return
        const previous = quotas.get(scope)
        // An answer from the window before must not undo what a newer one said.
        if (previous !== undefined && quota.resetAt < previous.resetAt) return
        quotas.set(scope, quota)
      }),

    /** The forge refused for its rate limit: stay away until `retryAt`, or for a growing while. */
    limited: (scope: string, retryAt: number | undefined): Effect.Effect<void> =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const previous = pauses.get(scope)
        const attempt = (previous?.attempt ?? 0) + 1
        const until =
          retryAt !== undefined && retryAt > now
            ? retryAt
            : now + Math.min(FALLBACK_PAUSE_MS * 2 ** (attempt - 1), MAX_FALLBACK_PAUSE_MS)
        pauses.set(scope, { until: Math.max(previous?.until ?? 0, until), attempt })
      }),

    /** The forge answered: a pause that ran out is forgotten, and with it its growth. */
    answered: (scope: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const pause = pauses.get(scope)
        if (pause !== undefined && pause.until <= (yield* Clock.currentTimeMillis)) {
          pauses.delete(scope)
        }
      }),

    withPermit: <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
      slots.withPermit(effect),

    recall: (key: string): Remembered | undefined => remembered.get(key),

    remember: (key: string, value: Remembered): void => {
      remembered.delete(key)
      remembered.set(key, value)
      if (remembered.size > MAX_REMEMBERED) {
        const oldest = remembered.keys().next()
        if (oldest.done !== true) remembered.delete(oldest.value)
      }
    },

    forget: (key: string): void => {
      remembered.delete(key)
    },
  }
})

export type ForgeGate = Effect.Success<typeof makeForgeGate>
