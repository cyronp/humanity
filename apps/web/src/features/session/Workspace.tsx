import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  acceptsMessages,
  type ChatMessage,
  DEFAULT_ACCOUNT,
  parseQuestions,
  type Project,
  QUESTION_TOOL,
  type TerminalOwner,
} from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { browserPreferencesAtom } from "@/features/browser/atoms"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useBrowser } from "@/features/browser/useBrowser"
import { KeyHint, useKeyHintShown } from "@/features/chat/ChatBox"
import { Composer, type ComposerHandle } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { WorkspaceFrame } from "@/features/layout/WorkspaceFrame"
import { QuestionPanel } from "@/features/questions/QuestionPanel"
import { ChangeCards } from "@/features/review/ChangeCards"
import { ConfirmationCard } from "@/features/review/ConfirmationCard"
import { ToolPanel, ToolRail } from "./panel/SessionPanel.tsx"
import { SessionHeader } from "./SessionHeader.tsx"
import { StoppedNote } from "./StoppedNote.tsx"
import {
  approvalsByToolUse,
  isBusy,
  pendingChanges,
  pendingConfirmations,
  type SessionView,
} from "./state.ts"
import { HINT_CLASS, UsageMeters } from "./UsageMeters.tsx"
import { ForkDialog, type ForkTarget } from "./ForkDialog.tsx"
import { RewindDialog } from "./RewindDialog.tsx"
import { interruptAtom, undoRewindAtom } from "./atoms.ts"
import { useSetupWorktree } from "./panel/useSetupWorktree.ts"
import { openCompare } from "@/features/compare/compare"
import { type PaletteCommand, usePaletteCommands } from "@/features/palette/registry"
import { useThreadPalette } from "./useThreadPalette.tsx"
import type { TranscriptActions } from "@/features/chat/transcriptActions"
import { describeCause } from "@/lib/errors"
import { useTranscript } from "./useTranscript.ts"

export interface WorkspaceSearch {
  readonly file?: string | undefined
  readonly message?: string | undefined
}

export function Workspace({
  project,
  view,
  search,
}: {
  readonly project: Project
  readonly view: SessionView
  readonly search: WorkspaceSearch
}) {
  const { session, approvals } = view
  const changes = useMemo(() => pendingChanges(approvals), [approvals])
  const confirmations = useMemo(() => pendingConfirmations(approvals), [approvals])
  const byToolUse = useMemo(() => approvalsByToolUse(approvals), [approvals])
  const transcript = useTranscript(view)
  const waiting = changes.length + confirmations.length
  const asked = confirmations.find((confirmation) => confirmation.toolName === QUESTION_TOOL)
  const questions = asked === undefined ? undefined : parseQuestions(asked.input)
  const cards =
    questions === undefined ? confirmations : confirmations.filter((each) => each !== asked)

  const activity = Object.keys(view.toolCalls).length + view.approvals.length
  const composer = useRef<ComposerHandle>(null)
  const canReference = acceptsMessages(session) && questions === undefined
  const terminalOwner = useMemo(
    (): TerminalOwner => ({ _tag: "Session", sessionId: session.id }),
    [session.id],
  )

  const browser = useBrowser(session.id, view.toolCalls)
  const browserPreferences = useAtomValue(browserPreferencesAtom)
  const offerLocalAddresses = AsyncResult.isSuccess(browserPreferences)
    ? browserPreferences.value.offerLocalAddresses
    : true

  const [rewinding, setRewinding] = useState<ChatMessage>()
  const [forking, setForking] = useState<ForkTarget>()
  const undoRewind = useAtomSet(undoRewindAtom, { mode: "promiseExit" })
  const transcriptActions = useMemo(
    (): TranscriptActions | undefined =>
      acceptsMessages(session) && session.status !== "ended"
        ? {
            onRewind: setRewinding,
            onFork: (turn) => setForking({ turn }),
            onUndoRewind: async (messageId) => {
              const exit = await undoRewind({ payload: { sessionId: session.id, messageId } })
              return Exit.isSuccess(exit) ? undefined : describeCause(exit.cause)
            },
          }
        : undefined,
    [session, undoRewind],
  )
  const setupWorktree = useSetupWorktree(session)
  const runSetupWorktree = useRef(setupWorktree.run)
  useEffect(() => {
    runSetupWorktree.current = setupWorktree.run
  })
  const canSetupWorktree = setupWorktree.available
  const interrupt = useAtomSet(interruptAtom, { mode: "promiseExit" })
  const paletteCommands = useMemo((): ReadonlyArray<PaletteCommand> => {
    const compare: ReadonlyArray<PaletteCommand> =
      session.groupId == null
        ? []
        : [
            {
              id: "thread.compare",
              title: "Compare runs",
              group: "This thread",
              keywords: ["models", "group", "keep"],
              run: () => openCompare(session.groupId ?? ""),
            },
          ]
    if (session.status === "ended") return compare
    const working = session.status === "running" || session.status === "waiting_for_human"
    return [
      ...compare,
      {
        id: "thread.fork",
        title: "Fork this thread",
        group: "This thread",
        keywords: ["branch", "copy", "duplicate"],
        run: () => setForking({}),
      },
      ...(canSetupWorktree && !working
        ? [
            {
              id: "thread.worktree",
              title: "Set up a worktree",
              group: "This thread",
              keywords: ["isolate", "branch"],
              run: () => void runSetupWorktree.current(),
            },
          ]
        : []),
      ...(working
        ? [
            {
              id: "thread.stop",
              title: "Stop the agent",
              group: "This thread",
              keywords: ["interrupt", "cancel"],
              run: () => void interrupt({ payload: { sessionId: session.id } }),
            },
          ]
        : []),
    ]
  }, [canSetupWorktree, interrupt, session])
  usePaletteCommands("thread", paletteCommands)
  useThreadPalette(session, composer)
  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  const [typing, setTyping] = useState(false)
  const keyHint = useKeyHintShown()
  const [dockHeight, setDockHeight] = useState(0)
  const attachDock = useCallback((node: HTMLDivElement | null) => {
    setDock(node)
    if (node !== null) setDockHeight(node.offsetHeight)
  }, [])
  useEffect(() => {
    if (dock === null) return
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight))
    observer.observe(dock)
    return () => observer.disconnect()
  }, [dock])

  useEffect(() => {
    const previous = document.title
    document.title =
      waiting > 0
        ? `(${waiting}) Waiting for you · ${session.title}`
        : `${session.title} · Humanity`
    return () => {
      document.title = previous
    }
  }, [waiting, session.title])

  return (
    <WorkspaceFrame
      terminals={{
        owner: terminalOwner,
        unavailable: session.status === "ended" ? "This thread has ended." : undefined,
      }}
      header={(actions) => (
        <SessionHeader
          project={project}
          session={session}
          actions={actions}
          onFork={session.status === "ended" ? undefined : () => setForking({})}
        />
      )}
      rail={(shelf, onSelect) => (
        <ToolRail
          session={session}
          shelf={shelf}
          browserUnseen={browser.unseen && offerLocalAddresses}
          onSelect={onSelect}
        />
      )}
      panel={({ tool, onClose }) => (
        <ToolPanel
          key={session.id}
          session={session}
          activity={activity}
          tool={tool}
          browser={browser}
          onClose={onClose}
          onCapture={
            canReference
              ? {
                  block: (text) => composer.current?.insert({ kind: "block", text }),
                  attach: (files) => composer.current?.attach(files),
                }
              : undefined
          }
          onReference={
            canReference
              ? (reference) => composer.current?.insert({ kind: "reference", reference })
              : undefined
          }
        />
      )}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <ForkDialog session={session} target={forking} onClose={() => setForking(undefined)} />
          <RewindDialog
            session={session}
            message={rewinding}
            onClose={() => setRewinding(undefined)}
            onRewound={(text) => composer.current?.replace(text)}
          />
          <MessageList
            focus={search.message}
            onFocusMissing={
              transcript.hasEarlier && !transcript.loading
                ? () => void transcript.loadEarlier()
                : undefined
            }
            actions={transcriptActions}
            bottomInset={dockHeight}
            messages={transcript.messages}
            toolCalls={transcript.toolCalls}
            draft={view.draft}
            working={session.status === "running"}
            approvals={byToolUse}
            worktreePath={session.worktreePath}
            empty={
              <p className="py-12 text-center text-sm text-muted-foreground">No messages yet.</p>
            }
            earlier={
              transcript.hasEarlier ? (
                <div className="flex flex-col items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={transcript.loading}
                    onClick={() => void transcript.loadEarlier()}
                  >
                    {transcript.loading && <Spinner />}
                    Show earlier messages
                  </Button>
                  {transcript.error !== undefined && (
                    <p className="text-xs text-destructive">{transcript.error}</p>
                  )}
                </div>
              ) : undefined
            }
            footer={
              view.error !== null ? (
                <StoppedNote
                  error={view.error}
                  plan={view.usage.plan}
                  onSwitch={
                    acceptsMessages(session) ? () => composer.current?.openModelPicker() : undefined
                  }
                />
              ) : undefined
            }
          />
        </div>
        <div
          ref={attachDock}
          className="pointer-events-none absolute inset-x-0 bottom-0 flex max-h-[calc(100%-3.5rem)] flex-col"
        >
          {(cards.length > 0 || changes.length > 0) && (
            <div className="min-h-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-4 *:pointer-events-auto">
                {cards.map((confirmation) => (
                  <div key={confirmation.id} className="rounded-lg bg-background">
                    <ConfirmationCard confirmation={confirmation} />
                  </div>
                ))}
                <ChangeCards changes={changes} file={search.file} />
              </div>
            </div>
          )}
          <div className="max-h-[calc(100svh-3.5rem)] shrink-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto has-[[data-slot=file-mention-menu]]:overflow-visible">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 *:pointer-events-auto">
              <UsageMeters
                sessionId={session.id}
                provider={session.provider}
                accountId={session.accountId ?? DEFAULT_ACCOUNT}
                usage={view.usage}
                hint={
                  keyHint && (asked === undefined || questions === undefined) ? (
                    <KeyHint typing={typing} className={HINT_CLASS} />
                  ) : undefined
                }
              />
              {asked !== undefined && questions !== undefined ? (
                <QuestionPanel key={asked.id} confirmation={asked} questions={questions} />
              ) : (
                <Composer
                  ref={composer}
                  sessionId={session.id}
                  projectId={session.projectId}
                  autonomy={session.autonomy}
                  provider={session.provider}
                  model={session.model}
                  effort={session.effort}
                  accountId={session.accountId ?? null}
                  disabled={!acceptsMessages(session)}
                  busy={isBusy(session.status)}
                  onTypingChange={setTyping}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </WorkspaceFrame>
  )
}
