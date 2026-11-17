import { HumanityClient, keys } from "@/lib/rpc"

export const gitlabConnectionAtom = HumanityClient.query(
  "GitLab.connection",
  { refresh: false },
  { reactivityKeys: [keys.gitlab] },
)

export const refreshGitLabConnectionAtom = HumanityClient.mutation("GitLab.connection")

export const setGitLabTokenAtom = HumanityClient.mutation("GitLab.setToken")
export const removeGitLabTokenAtom = HumanityClient.mutation("GitLab.removeToken")

export const gitlabReposAtom = HumanityClient.query("GitLab.listRepos", undefined, {
  reactivityKeys: [keys.gitlab],
})
