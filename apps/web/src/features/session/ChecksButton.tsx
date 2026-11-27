import { useAtomSet } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { ListChecks, LoaderCircle } from "lucide-react"
import { useCallback } from "react"
import { useProject } from "@/features/projects/useProject"
import { openSettings } from "@/features/settings/settings"
import { describeCause } from "@/lib/errors"
import { IconButton } from "@/components/IconButton"
import { runChecksAtom } from "./atoms.ts"
import { checksRunning, setChecksState, useChecksState } from "./checks.ts"

export const useRunChecks = (session: Session) => {
  const run = useAtomSet(runChecksAtom, { mode: "promiseExit" })
  return useCallback(async () => {
    if (checksRunning(session.id)) return
    setChecksState(session.id, { _tag: "running" })
    const exit = await run({ payload: { sessionId: session.id } })
    setChecksState(
      session.id,
      Exit.isSuccess(exit)
        ? { _tag: "done", result: exit.value }
        : { _tag: "error", message: describeCause(exit.cause) },
    )
  }, [run, session.id])
}

export const useCheckScript = (session: Session): string | null => {
  const project = useProject(session.projectId)
  return AsyncResult.isSuccess(project) ? (project.value?.settings.checkScript ?? null) : null
}

export function ChecksButton({ session }: { readonly session: Session }) {
  const script = useCheckScript(session)
  const state = useChecksState(session.id)
  const runChecks = useRunChecks(session)
  const running = state?._tag === "running"
  const label =
    script === null
      ? "Set up checks for this project"
      : running
        ? "Running the checks…"
        : "Run checks"
  if (session.status === "ended") return null
  return (
    <IconButton
      variant="ghost"
      size="icon-sm"
      label={label}
      disabled={running}
      onClick={() =>
        script === null ? openSettings("projects", session.projectId) : void runChecks()
      }
      tooltip={
        <>
          {script === null ? (
            <>
              Run your lint, typecheck and tests in one click: set them up in Settings, under
              Projects.
            </>
          ) : (
            <>
              {label}
              <span className="block font-mono text-xs opacity-80">
                {script.trim().split(/\r?\n/).join(" && ")}
              </span>
            </>
          )}
        </>
      }
    >
      {running ? <LoaderCircle className="animate-spin" /> : <ListChecks />}
    </IconButton>
  )
}
