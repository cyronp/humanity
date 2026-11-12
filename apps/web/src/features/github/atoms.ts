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

export interface CloneProgress {
  readonly fullName: string
  /** git's progress output so far, newest last, capped. */
  readonly lines: ReadonlyArray<string>
  readonly project: Project | undefined
}

const MAX_LINES = 200

const reduceClone = (state: CloneProgress, event: CloneEvent): CloneProgress =>
  event._tag === "Progress"
    ? { ...state, lines: [...state.lines, event.line].slice(-MAX_LINES) }
    : { ...state, project: event.project }

/** Starts a clone and follows its progress until the project is added. */
export const cloneAtom = HumanityClient.runtime.fn((fullName: string) =>
  Stream.unwrap(
    HumanityClient.use((client) =>
      Effect.succeed(client("Projects.cloneFromGitHub", { fullName })),
    ),
  ).pipe(
    Stream.scan((): CloneProgress => ({ fullName, lines: [], project: undefined }), reduceClone),
  ),
)
