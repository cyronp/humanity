import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  type AgentProvider,
  CLI_COMMANDS,
  DEFAULT_CLI_PATH_PREFERENCES,
  PROVIDER_NAMES,
} from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { type ReactNode, useId, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SettingsGroup, SettingsRow, SettingsRows } from "@/features/settings/SettingsLayout"
import { describeCause } from "@/lib/errors"
import { HumanityClient, keys } from "@/lib/rpc"
import { agentCliAtom } from "./cli.ts"

const cliPathsAtom = HumanityClient.query("Preferences.getCliPaths", undefined, {
  reactivityKeys: [keys.preferences],
})

const setCliPathsAtom = HumanityClient.mutation("Preferences.setCliPaths")

const STATUS_KEYS: Readonly<Record<AgentProvider, string>> = {
  "claude-code": keys.claude,
  codex: keys.codex,
  kiro: keys.kiro,
  antigravity: keys.antigravity,
}

export function ProviderOptions({
  provider,
  children,
}: {
  readonly provider: AgentProvider
  readonly children?: ReactNode
}) {
  return (
    <SettingsGroup title="Options">
      <SettingsRows>
        <CliPathSetting provider={provider} />
        {children}
      </SettingsRows>
    </SettingsGroup>
  )
}

function CliPathSetting({ provider }: { readonly provider: AgentProvider }) {
  const result = useAtomValue(cliPathsAtom)
  const cli = useAtomValue(agentCliAtom(provider))
  const save = useAtomSet(setCliPathsAtom, { mode: "promiseExit" })
  const [error, setError] = useState<string>()
  const labelId = useId()
  const paths = AsyncResult.isSuccess(result) ? result.value : DEFAULT_CLI_PATH_PREFERENCES
  const saved = paths[provider]
  const found = AsyncResult.isSuccess(cli) ? cli.value.path : null
  const command = CLI_COMMANDS[provider]

  const change = async (next: string | null) => {
    setError(undefined)
    const exit = await save({
      payload: { paths: { ...paths, [provider]: next } },
      reactivityKeys: [keys.preferences, keys.agentCli(provider), STATUS_KEYS[provider]],
    })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <SettingsRow
      label="CLI path"
      labelId={labelId}
      stacked
      detail={
        saved === null
          ? `Empty finds \`${command}\` on your PATH and in its installer's folders${found === null ? "" : `: ${found}`}.`
          : found !== null && found !== saved
            ? `${saved} is gone, so ${PROVIDER_NAMES[provider]} runs from ${found}.`
            : `${PROVIDER_NAMES[provider]} runs from this file instead of the one on your PATH.`
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            key={saved ?? ""}
            aria-labelledby={labelId}
            className="min-w-0 flex-1 font-mono text-xs"
            placeholder={found ?? command}
            defaultValue={saved ?? ""}
            disabled={!AsyncResult.isSuccess(result)}
            onBlur={(event) => {
              const next = event.currentTarget.value.trim()
              if (next !== (saved ?? "")) void change(next === "" ? null : next)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
          {saved !== null && (
            <Button variant="outline" size="sm" onClick={() => void change(null)}>
              Use the PATH
            </Button>
          )}
        </div>
        {error !== undefined && <ErrorNote title="The path was not saved" message={error} />}
      </div>
    </SettingsRow>
  )
}
