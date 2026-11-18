import { Schema } from "effect"
import { ProjectId } from "./Project.ts"
import { SessionId } from "./Session.ts"

export const TerminalId = Schema.String.pipe(Schema.brand("TerminalId"))
export type TerminalId = typeof TerminalId.Type

/**
 * Whose terminals they are: a thread's, opened in its folder; a project's, opened in its checkout
 * outside any thread; or, before any project was added, the human's own, opened in their home
 * folder. Only a thread's terminals are ever its agent's to use.
 */
export const TerminalOwner = Schema.TaggedUnion({
  Session: { sessionId: SessionId },
  Project: { projectId: ProjectId },
  Home: {},
})
export type TerminalOwner = typeof TerminalOwner.Type

/** One string per owner, the same on both sides: what its terminals are grouped and saved under. */
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

/** Who opened a terminal: the human from the dock, or the agent through Humanity's tools. */
export const TerminalOpener = Schema.Literals(["human", "agent"])
export type TerminalOpener = typeof TerminalOpener.Type

/**
 * `restored` is a terminal brought back after the daemon restarted: its screen is there, its shell
 * starts when someone attaches to it or the agent uses it.
 */
export const TerminalState = Schema.Literals(["starting", "running", "exited", "restored"])
export type TerminalState = typeof TerminalState.Type

/** `checkout` marks a terminal left in the project's checkout after its thread moved to a worktree. */
export const TerminalLocation = Schema.Literals(["folder", "checkout"])
export type TerminalLocation = typeof TerminalLocation.Type

export const TerminalInfo = Schema.Struct({
  id: TerminalId,
  owner: TerminalOwner,
  /** 1-based, in the order its owner's terminals were opened; names an untitled terminal. */
  ordinal: Schema.Number,
  /** A title the human or the agent gave it; `null` shows the folder it is in. */
  title: Schema.NullOr(Schema.String),
  opener: TerminalOpener,
  shell: Schema.String,
  shellName: Schema.String,
  cwd: Schema.String,
  location: TerminalLocation,
  state: TerminalState,
  /** The exit code of the terminal's process, once it exited. */
  exitCode: Schema.NullOr(Schema.Number),
  /** Whether a command runs; `null` when the shell has no integration to tell. */
  busy: Schema.NullOr(Schema.Boolean),
  /** The exit code of the last command the shell ran, when its integration reports it. */
  lastExitCode: Schema.NullOr(Schema.Number),
  /** Whether the shell reports its commands and folder (OSC 133 and OSC 7). */
  integration: Schema.Boolean,
  createdAt: Schema.String,
})
export type TerminalInfo = typeof TerminalInfo.Type

export const ShellInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
})
export type ShellInfo = typeof ShellInfo.Type

/**
 * What a browser attached to a terminal receives. `Snapshot` replaces whatever the view showed:
 * it comes first, and again when the view fell too far behind to be sent what it missed.
 * `seq` counts the characters the terminal printed so far, so the view acknowledges by it.
 */
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

export const TERMINAL_FONT_SIZES = { min: 8, max: 32 } as const
export const TERMINAL_SCROLLBACK = { min: 1_000, max: 50_000 } as const

export const TerminalPreferences = Schema.Struct({
  /** A shell id from `Terminals.shells`; `null` for the system's default. */
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

/** The name a tab shows: its title, else the last segment of its folder. */
export const terminalLabel = (
  terminal: Pick<TerminalInfo, "title" | "cwd" | "ordinal">,
): string => {
  if (terminal.title !== null && terminal.title.trim() !== "") return terminal.title
  const folder = terminal.cwd
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .at(-1)
  return folder === undefined || folder === "" ? `Terminal ${terminal.ordinal}` : folder
}
