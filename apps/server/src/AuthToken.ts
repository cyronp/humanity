import { Context, Effect, FileSystem, Layer } from "effect"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { ServerConfig } from "./ServerConfig.ts"

/**
 * The daemon's auth token. Generated on first start, kept in
 * `<home>/auth-token` and never stored in the database.
 */
export class AuthToken extends Context.Service<
  AuthToken,
  {
    readonly value: string
    /** Constant-time comparison against a candidate supplied by a client. */
    readonly matches: (candidate: string | null | undefined) => boolean
  }
>()("humanity/AuthToken") {
  static readonly layer = Layer.effect(
    AuthToken,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const config = yield* ServerConfig

      const existing = yield* fs.readFileString(config.authTokenPath).pipe(
        Effect.map((text) => text.trim()),
        Effect.catch(() => Effect.succeed("")),
      )
      const value = existing.length >= 32 ? existing : randomBytes(32).toString("base64url")
      if (value !== existing) {
        yield* fs.writeFileString(config.authTokenPath, value, { mode: 0o600 })
      }

      const expected = Buffer.from(value)
      return AuthToken.of({
        value,
        matches: (candidate) => {
          if (typeof candidate !== "string") return false
          const actual = Buffer.from(candidate)
          return actual.length === expected.length && timingSafeEqual(actual, expected)
        },
      })
    }).pipe(Effect.orDie),
  )
}
