import type { CloneEvent, Project } from "@humanity/contracts"
import { Effect, Stream } from "effect"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

export const githubConnectionAtom = HumanityClient.query(
  "GitHub.connection",
  { refresh: false },
  { reactivityKeys: [keys.github] },
)

export const refreshGitHubConnectionAtom = HumanityClient.mutation("GitHub.connection")

export const setGitHubTokenAtom = HumanityClient.mutation("GitHub.setToken")
export const removeGitHubTokenAtom = HumanityClient.mutation("GitHub.removeToken")

export const reposAtom = HumanityClient.query("GitHub.listRepos", undefined, {
  reactivityKeys: [keys.github],
})

export const githubBranchesAtom = Atom.family((fullName: string) =>
  HumanityClient.query("GitHub.listBranches", { fullName }),
)

export type CloneTarget =
  | { readonly provider: "github"; readonly fullName: string }
  | { readonly provider: "gitlab"; readonly fullPath: string }

export const cloneTargetName = (target: CloneTarget): string =>
  target.provider === "github" ? target.fullName : target.fullPath

export interface CloneProgress {
  readonly target: CloneTarget
  readonly lines: ReadonlyArray<string>
  readonly project: Project | undefined
}

const MAX_LINES = 200

const reduceClone = (state: CloneProgress, event: CloneEvent): CloneProgress =>
  event._tag === "Progress"
    ? { ...state, lines: [...state.lines, event.line].slice(-MAX_LINES) }
    : { ...state, project: event.project }

const asOne = <S extends Stream.Stream<unknown, unknown, unknown>>(
  stream: S,
): Stream.Stream<Stream.Success<S>, Stream.Error<S>, Stream.Services<S>> => stream as never

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

export const cloneProjectAtom = HumanityClient.runtime
  .fn((target: CloneTarget) =>
    HumanityClient.use((client) =>
      Stream.runCollect(
        asOne(
          target.provider === "github"
            ? client("Projects.cloneFromGitHub", { fullName: target.fullName })
            : client("Projects.cloneFromGitLab", { fullPath: target.fullPath }),
        ),
      ).pipe(
        Effect.map((events) => {
          for (const event of events) if (event._tag === "Cloned") return event.project
          return undefined
        }),
      ),
    ),
  )
  .pipe(Atom.keepAlive)
