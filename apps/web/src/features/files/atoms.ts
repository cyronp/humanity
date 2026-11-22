import type { SessionId } from "@humanity/contracts"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

export const fileListAtom = Atom.family((sessionId: SessionId) =>
  HumanityClient.query("Files.list", { sessionId }, { reactivityKeys: [keys.files(sessionId)] }),
)

export const readFileAtom = HumanityClient.mutation("Files.read")
export const fileVersionsAtom = HumanityClient.mutation("Files.versions")
export const writeFileAtom = HumanityClient.mutation("Files.write")

export const editorPreferencesAtom = HumanityClient.query("Preferences.getEditor", undefined, {
  reactivityKeys: [keys.preferences],
})
export const setEditorPreferencesAtom = HumanityClient.mutation("Preferences.setEditor")
