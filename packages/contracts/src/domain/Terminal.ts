import { Schema } from "effect"
import { trimTrailing } from "../text.ts"
import { ProjectId } from "./Project.ts"
import { SessionId } from "./Session.ts"

export const TerminalId = Schema.String.pipe(Schema.brand("TerminalId"))
export type TerminalId = typeof TerminalId.Type

export const TerminalOwner = Schema.TaggedUnion({
  Session: { sessionId: SessionId },
  Project: { projectId: ProjectId },
  Home: {},
})
export type TerminalOwner = typeof TerminalOwner.Type

export const terminalOwnerKey = (owner: TerminalOwner): string => {
  switch (owner._tag) {
    case "Session":
      return owner.sessionId
    case "Project":
      return `project-${owner.projectId}`
    case "Home":
      return "home"
  }
}

export const TerminalOpener = Schema.Literals(["human", "agent"])
export type TerminalOpener = typeof TerminalOpener.Type

export const TerminalState = Schema.Literals(["starting", "running", "exited", "restored"])
export type TerminalState = typeof TerminalState.Type

export const TerminalLocation = Schema.Literals(["folder", "checkout"])
export type TerminalLocation = typeof TerminalLocation.Type

export const TerminalInfo = Schema.Struct({
  id: TerminalId,
  owner: TerminalOwner,
  ordinal: Schema.Number,
  title: Schema.NullOr(Schema.String),
  opener: TerminalOpener,
  shell: Schema.String,
  shellName: Schema.String,
  cwd: Schema.String,
  location: TerminalLocation,
  state: TerminalState,
  exitCode: Schema.NullOr(Schema.Number),
  busy: Schema.NullOr(Schema.Boolean),
  lastExitCode: Schema.NullOr(Schema.Number),
  integration: Schema.Boolean,
  urls: Schema.Array(Schema.Struct({ url: Schema.String, seenAt: Schema.String })),
  createdAt: Schema.String,
})
export type TerminalInfo = typeof TerminalInfo.Type

export const ShellInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
})
export type ShellInfo = typeof ShellInfo.Type

export const TerminalAttachEvent = Schema.TaggedUnion({
  Snapshot: {
    data: Schema.String,
    seq: Schema.Number,
    cols: Schema.Number,
    rows: Schema.Number,
  },
  Output: { data: Schema.String, seq: Schema.Number },
  Exited: { exitCode: Schema.NullOr(Schema.Number) },
})
export type TerminalAttachEvent = typeof TerminalAttachEvent.Type

const HexColor = Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/))

export const TerminalColors = Schema.Struct({
  foreground: HexColor,
  background: HexColor,
  cursor: HexColor,
  ansi: Schema.Array(HexColor).check(Schema.isMinLength(16), Schema.isMaxLength(16)),
})
export type TerminalColors = typeof TerminalColors.Type

export const TERMINAL_FONT_SIZES = { min: 8, max: 32 } as const
export const TERMINAL_SCROLLBACK = { min: 1_000, max: 50_000 } as const

export const TerminalPreferences = Schema.Struct({
  shell: Schema.NullOr(Schema.String),
  fontSize: Schema.Int.check(
    Schema.isBetween({ minimum: TERMINAL_FONT_SIZES.min, maximum: TERMINAL_FONT_SIZES.max }),
  ),
  scrollback: Schema.Int.check(
    Schema.isBetween({ minimum: TERMINAL_SCROLLBACK.min, maximum: TERMINAL_SCROLLBACK.max }),
  ),
})
export type TerminalPreferences = typeof TerminalPreferences.Type

export const DEFAULT_TERMINAL_PREFERENCES: TerminalPreferences = {
  shell: null,
  fontSize: 13,
  scrollback: 5_000,
}

export const terminalLabel = (
  terminal: Pick<TerminalInfo, "title" | "cwd" | "ordinal">,
): string => {
  if (terminal.title !== null && terminal.title.trim() !== "") return terminal.title
  const folder = trimTrailing(terminal.cwd, "\\/").split(/[\\/]/).at(-1)
  return folder === undefined || folder === "" ? `Terminal ${terminal.ordinal}` : folder
}
