import { HumanityClient, keys } from "@/lib/rpc"

export const projectsAtom = HumanityClient.query("Projects.list", undefined, {
  reactivityKeys: [keys.projects],
})

export const addLocalProjectAtom = HumanityClient.mutation("Projects.addLocal")

export const removeProjectAtom = HumanityClient.mutation("Projects.remove")
