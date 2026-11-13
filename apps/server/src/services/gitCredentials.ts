import { Option, Redacted } from "effect"

/**
 * Environment that gives one git process (a clone or a push) a token. Git
 * reads the header from the environment, so the token is never written into
 * the repository's config or shown in `ps`. It is only sent to URLs under
 * `origin`, and `user` is the name that host expects next to a token:
 * `x-access-token` on GitHub, `oauth2` on GitLab.
 */
export const credentialEnv = (
  origin: string,
  user: string,
  token: Option.Option<Redacted.Redacted<string>>,
): Record<string, string> =>
  Option.match(token, {
    onNone: () => ({}),
    onSome: (value) => ({
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `http.${origin}/.extraheader`,
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(
        `${user}:${Redacted.value(value)}`,
      ).toString("base64")}`,
    }),
  })
