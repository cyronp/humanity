import {
  computeHunks,
  type Hunk,
  type Simulation,
  simulateEdit,
  simulateWrite,
} from "@humanity/diff"
import { Predicate } from "effect"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { isInsideDir } from "../paths.ts"

/** Tools whose effect on a file can be simulated, and so reviewed hunk by hunk. */
const SIMULATORS: Record<string, (original: string, input: Record<string, unknown>) => Simulation> =
  {
    Edit: (original, input) =>
      Predicate.isString(input["old_string"]) && Predicate.isString(input["new_string"])
        ? simulateEdit(original, {
            old_string: input["old_string"],
            new_string: input["new_string"],
            replace_all: input["replace_all"] === true,
          })
        : { ok: false, reason: "The Edit call is missing old_string or new_string." },
    Write: (_original, input) =>
      Predicate.isString(input["content"])
        ? simulateWrite({ content: input["content"] })
        : { ok: false, reason: "The Write call is missing its content." },
  }

export type ReviewTarget =
  | {
      readonly _tag: "Target"
      readonly absolutePath: string
      /** Relative to the worktree, with forward slashes. */
      readonly filePath: string
    }
  /** The call cannot be reviewed as hunks; ask for an allow or deny instead. */
  | { readonly _tag: "Confirm" }
  /** The call must not run at all. */
  | { readonly _tag: "Deny"; readonly message: string }

/** Where a `review` tool call would write, or why it cannot be reviewed as a file change. */
const outsideMessage = (rawPath: string, workdir: string) =>
  `DENIED: ${rawPath} is outside the folder this session works in (${workdir}). Only files inside it can be changed.`

export const reviewTarget = (
  toolName: string,
  input: Record<string, unknown>,
  worktree: string,
): ReviewTarget => {
  if (SIMULATORS[toolName] === undefined) return { _tag: "Confirm" }
  const rawPath = input["file_path"]
  if (!Predicate.isString(rawPath) || rawPath.trim() === "") {
    return { _tag: "Deny", message: `The ${toolName} call has no file_path.` }
  }
  const absolutePath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(worktree, rawPath)
  if (!isInsideDir(worktree, absolutePath)) {
    return {
      _tag: "Deny",
      message: outsideMessage(rawPath, worktree),
    }
  }
  return {
    _tag: "Target",
    absolutePath,
    filePath: relative(worktree, absolutePath).split(sep).join("/"),
  }
}

/**
 * Why a `review` tool the session lets through without a review must still be
 * denied, if it must: a file outside the worktree. `undefined` when it may run.
 * Covers tools without a simulator too, through their `notebook_path`.
 */
export const outsideWorktreeDenial = (
  toolName: string,
  input: Record<string, unknown>,
  worktree: string,
): string | undefined => {
  const target = reviewTarget(toolName, input, worktree)
  if (target._tag === "Deny") return target.message
  if (target._tag === "Target") return undefined
  for (const key of ["file_path", "notebook_path"]) {
    const rawPath = input[key]
    if (!Predicate.isString(rawPath) || rawPath.trim() === "") continue
    const absolutePath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(worktree, rawPath)
    if (!isInsideDir(worktree, absolutePath)) {
      return outsideMessage(rawPath, worktree)
    }
  }
  return undefined
}

export type PlannedChange =
  | { readonly _tag: "Change"; readonly proposedContent: string; readonly hunks: Array<Hunk> }
  | { readonly _tag: "Deny"; readonly message: string }

/** Simulates the call on the file's current content and splits the result into hunks. */
export const planChange = (options: {
  readonly toolName: string
  readonly input: Record<string, unknown>
  readonly filePath: string
  readonly originalContent: string
  readonly idPrefix: string
}): PlannedChange => {
  const simulate = SIMULATORS[options.toolName]
  if (simulate === undefined) {
    return { _tag: "Deny", message: `${options.toolName} cannot be reviewed as a file change.` }
  }
  const simulation = simulate(options.originalContent, options.input)
  if (!simulation.ok) {
    return {
      _tag: "Deny",
      message: `NOT APPLIED: Humanity could not simulate this ${options.toolName} on ${options.filePath}: ${simulation.reason}`,
    }
  }
  const hunks = computeHunks(options.originalContent, simulation.content, {
    idPrefix: options.idPrefix,
  })
  if (hunks.length === 0) {
    return {
      _tag: "Deny",
      message: `NOT APPLIED: this ${options.toolName} would leave ${options.filePath} unchanged, so there is nothing to review.`,
    }
  }
  return { _tag: "Change", proposedContent: simulation.content, hunks }
}
