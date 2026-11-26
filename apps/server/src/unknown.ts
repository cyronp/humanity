import { type Option, Schema } from "effect"

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const decode =
  <S extends Schema.Constraint>(schema: S) =>
  (input: unknown): Option.Option<S["Type"]> =>
    Schema.decodeUnknownOption(schema as never)(input) as Option.Option<S["Type"]>
