import type { CloneEvent, Project } from "@humanity/contracts"
import { Effect, Stream } from "effect"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

/** How Humanity reaches GitHub: where the token comes from and who it signs in as. */
export const githubConnectionAtom = HumanityClient.query(
  "GitHub.connection",
  { refresh: false },
  { reactivityKeys: [keys.github] },
)

/** Same RPC as a mutation: looks the token up again (with `refresh: true`, right away). */
export const refreshGitHubConnectionAtom = HumanityClient.mutation("GitHub.connection")

export const setGitHubTokenAtom = HumanityClient.mutation("GitHub.setToken")
export const removeGitHubTokenAtom = HumanityClient.mutation("GitHub.removeToken")

export const reposAtom = HumanityClient.query("GitHub.listRepos", undefined, {
  reactivityKeys: [keys.github],
})

export const githubBranchesAtom = Atom.family((fullName: string) =>
  HumanityClient.query("GitHub.listBranches", { fullName }),
)

/** A repository to clone: `owner/repo` on GitHub, or `group/name` on the connected GitLab instance. */
export type CloneTarget =
  | { readonly provider: "github"; readonly fullName: string }
  | { readonly provider: "gitlab"; readonly fullPath: string }

/** The repository's name as its host writes it. */
export const cloneTargetName = (target: CloneTarget): string =>
  target.provider === "github" ? target.fullName : target.fullPath

export interface CloneProgress {
  readonly target: CloneTarget
  /** git's progress output so far, newest last, capped. */
  readonly lines: ReadonlyArray<string>
  readonly project: Project | undefined
}

const MAX_LINES = 200

const reduceClone = (state: CloneProgress, event: CloneEvent): CloneProgress =>
  event._tag === "Progress"
    ? { ...state, lines: [...state.lines, event.line].slice(-MAX_LINES) }
    : { ...state, project: event.project }

/** One of several streams, typed as a single stream that can fail the way any of them does. */
const asOne = <S extends Stream.Stream<unknown, unknown, unknown>>(
  stream: S,
): Stream.Stream<Stream.Success<S>, Stream.Error<S>, Stream.Services<S>> => stream as never

/** Starts a clone and follows its progress until the project is added. */
export const cloneAtom = HumanityClient.runtime.fn((target: CloneTarget) =>
  Stream.unwrap(
    HumanityClient.use((client) =>
      Effect.succeed(
        asOne(
          target.provider === "github"
            ? client("Projects.cloneFromGitHub", { fullName: target.fullName })
            : client("Projects.cloneFromGitLab", { fullPath: target.fullPath }),
        ),
      ),
    ),
  ).pipe(
    Stream.scan((): CloneProgress => ({ target, lines: [], project: undefined }), reduceClone),
  ),
)
