import { HumanityClient, keys } from "@/lib/rpc"

/** How Humanity reaches GitLab: which instance, where the token comes from and who it signs in as. */
export const gitlabConnectionAtom = HumanityClient.query(
  "GitLab.connection",
  { refresh: false },
  { reactivityKeys: [keys.gitlab] },
)

/** Same RPC as a mutation: looks the token up again (with `refresh: true`, right away). */
export const refreshGitLabConnectionAtom = HumanityClient.mutation("GitLab.connection")

export const setGitLabTokenAtom = HumanityClient.mutation("GitLab.setToken")
export const removeGitLabTokenAtom = HumanityClient.mutation("GitLab.removeToken")

export const gitlabReposAtom = HumanityClient.query("GitLab.listRepos", undefined, {
  reactivityKeys: [keys.gitlab],
})
