import { Option, Redacted } from "effect"

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
