import { useAtomSet } from "@effect/atom-react"
import { acceptsMessages, DEFAULT_ACCOUNT, PROVIDER_NAMES, type Session } from "@humanity/contracts"
import { Exit } from "effect"
import { type RefObject, useEffect, useMemo } from "react"
import type { ComposerHandle } from "@/features/chat/Composer"
import { FileResults } from "@/features/files/FileResults"
import {
  type PaletteCommand,
  type PaletteOutcome,
  type PaletteResultsProps,
  type PaletteSource,
  recordThreadVisit,
  usePaletteCommands,
  usePaletteSource,
} from "@/features/palette/registry"
import { SkillResults } from "@/features/palette/SkillResults"
import { AUTONOMY_OPTIONS } from "@/features/policy/AutonomyPicker"
import {
  DEFAULT_MODEL,
  offeredProviders,
  type PickerModel,
  shortModelName,
} from "@/features/providers/models"
import { PROVIDERS, type ProviderId, ProviderIcon } from "@/features/providers/ProviderIcon"
import { EFFORT_OPTIONS } from "@/features/providers/ReasoningPicker"
import { useProviderAccounts, useProviderModels } from "@/features/providers/useProviderModels"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { pushAtom, syncAtom } from "./atoms.ts"

const outcomeOf = (exit: Exit.Exit<unknown, unknown>): PaletteOutcome =>
  Exit.isSuccess(exit) ? undefined : { error: describeCause(exit.cause) }

const copy = (text: string) => void navigator.clipboard?.writeText(text)

export function useThreadPalette(
  session: Session,
  composer: RefObject<ComposerHandle | null>,
): void {
  useEffect(() => recordThreadVisit(session.id), [session.id])

  const busy = session.status === "running" || session.status === "waiting_for_human"
  const writable = acceptsMessages(session) && session.status !== "ended"
  const modelItems = useModelItems(session, busy, composer)
  const push = useAtomSet(pushAtom, { mode: "promiseExit" })
  const sync = useAtomSet(syncAtom, { mode: "promiseExit" })

  const commands = useMemo((): ReadonlyArray<PaletteCommand> => {
    const sourceControl: ReadonlyArray<PaletteCommand> = [
      {
        id: "git.copy-branch",
        title: "Copy the branch name",
        group: "Source control",
        detail: session.branch,
        keywords: ["git", "clipboard"],
        run: () => copy(session.branch),
      },
      ...(session.status === "ended"
        ? []
        : [
            {
              id: "git.sync",
              title: "Sync with origin",
              group: "Source control",
              keywords: ["git", "pull", "fetch", "rebase", "update"],
              run: async () =>
                outcomeOf(
                  await sync({
                    payload: { sessionId: session.id },
                    reactivityKeys: [
                      keys.sync(session.id),
                      keys.publication(session.id),
                      keys.sessionDiff(session.id),
                      keys.sessionCommits(session.id),
                      keys.git(session.projectId),
                    ],
                  }),
                ),
            } satisfies PaletteCommand,
            {
              id: "git.push",
              title: "Push",
              group: "Source control",
              keywords: ["git", "upload", "publish", "origin"],
              run: async () =>
                outcomeOf(
                  await push({
                    payload: { sessionId: session.id },
                    reactivityKeys: [
                      keys.publication(session.id),
                      keys.sessionCommits(session.id),
                      keys.git(session.projectId),
                      keys.sync(session.id),
                    ],
                  }),
                ),
            } satisfies PaletteCommand,
          ]),
    ]
    if (!writable) return sourceControl
    const mode = AUTONOMY_OPTIONS.find((option) => option.value === session.autonomy)
    return [
      {
        id: "thread.mode",
        title: "Permissions",
        group: "This thread",
        detail: mode?.label,
        keywords: ["mode", "autonomy", "ask me", "accept edits", "auto mode"],
        page: {
          title: "Permissions",
          items: AUTONOMY_OPTIONS.map((option): PaletteCommand => ({
            id: `thread.mode.${option.value}`,
            title: option.label,
            group: "Permissions",
            checked: option.value === session.autonomy,
            run: () => composer.current?.changeAutonomy(option.value),
          })),
        },
      },
      {
        id: "thread.model",
        title: "Change the model",
        group: "This thread",
        keywords: ["provider", "switch", "agent", "account"],
        page: { title: "Change the model", placeholder: "Search models…", items: modelItems },
      },
      {
        id: "thread.effort",
        title: "Reasoning effort",
        group: "This thread",
        detail: EFFORT_OPTIONS.find((option) => option.value === (session.effort ?? "default"))
          ?.label,
        keywords: ["thinking", "effort"],
        page: {
          title: "Reasoning effort",
          items: EFFORT_OPTIONS.map((option): PaletteCommand => ({
            id: `thread.effort.${option.value}`,
            title: option.label,
            group: "Reasoning effort",
            detail: option.description,
            checked: option.value === (session.effort ?? "default"),
            run: () =>
              composer.current?.changeEffort(option.value === "default" ? null : option.value),
          })),
        },
      },
      ...sourceControl,
    ]
  }, [composer, modelItems, push, session, sync, writable])
  usePaletteCommands("thread-extras", commands)

  const files = useMemo(
    (): PaletteSource => ({
      Results: (props: PaletteResultsProps) => <FileResults sessionId={session.id} {...props} />,
    }),
    [session.id],
  )
  usePaletteSource("files", files)

  const skills = useMemo(
    (): PaletteSource | undefined =>
      writable
        ? {
            Results: (props: PaletteResultsProps) => (
              <SkillResults
                projectId={session.projectId}
                onPick={(skill) =>
                  composer.current?.insert({ kind: "skill", invocation: skill.invocation })
                }
                {...props}
              />
            ),
          }
        : undefined,
    [composer, session.projectId, writable],
  )
  usePaletteSource("skills", skills)
}

function useModelItems(
  session: Session,
  locked: boolean,
  composer: RefObject<ComposerHandle | null>,
): ReadonlyArray<PaletteCommand> {
  const { models: reported, connected } = useProviderModels()
  const accounts = useProviderAccounts()
  return useMemo(() => {
    const currentAccount = session.accountId ?? DEFAULT_ACCOUNT
    const providers = offeredProviders(
      Object.keys(PROVIDERS) as Array<ProviderId>,
      session.provider,
      connected,
      locked,
    )
    const selected = session.model ?? DEFAULT_MODEL
    return providers.flatMap((provider) => {
      const signedIn = accounts[provider].filter((account) => account.connected)
      const choices: ReadonlyArray<{
        readonly accountId: string
        readonly accountName: string | undefined
        readonly models: ReadonlyArray<PickerModel>
      }> =
        signedIn.length === 0
          ? [{ accountId: currentAccount, accountName: undefined, models: reported[provider] }]
          : signedIn
              .filter(
                (account) =>
                  !locked || provider !== session.provider || account.id === currentAccount,
              )
              .map((account) => ({
                accountId: account.id,
                accountName: signedIn.length > 1 ? account.name : undefined,
                models: account.models,
              }))
      return choices.flatMap(({ accountId, accountName, models }) =>
        models
          .filter((model) => !model.legacy || model.value === selected)
          .map((model): PaletteCommand => {
            const current =
              provider === session.provider &&
              model.value === selected &&
              accountId === currentAccount
            return {
              id: `thread.model.${provider}.${accountId}.${model.value}`,
              title: shortModelName(model),
              group:
                accountName === undefined
                  ? PROVIDER_NAMES[provider]
                  : `${PROVIDER_NAMES[provider]} · ${accountName}`,
              detail:
                accountName === undefined
                  ? PROVIDER_NAMES[provider]
                  : `${PROVIDER_NAMES[provider]} · ${accountName}`,
              keywords: [model.value, PROVIDER_NAMES[provider], accountName ?? ""],
              icon: <ProviderIcon provider={provider} className="size-4" />,
              checked: current,
              run: () =>
                composer.current?.changeModel({
                  provider,
                  model: model.value === DEFAULT_MODEL ? null : model.value,
                  accountId,
                }),
            }
          }),
      )
    })
  }, [accounts, composer, connected, locked, reported, session])
}
