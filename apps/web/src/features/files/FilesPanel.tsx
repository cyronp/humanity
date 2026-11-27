import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { DEFAULT_EDITOR_PREFERENCES, type Session } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { FilePlus, FolderTree, PanelLeft, RefreshCw, Search, TextSearch } from "lucide-react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ResizeHandle } from "@/components/ResizeHandle"
import { Button } from "@/components/ui/button"
import { useWidePanel } from "@/features/layout/panelWidth"
import { sessionDiffAtom } from "@/features/session/atoms"
import { RAIL_WIDTH, titlebarPaddingEnd } from "@/features/session/panel/SessionPanel"
import { useStoredFlag } from "@/features/terminal/dock"
import { useStoredWidth } from "@/lib/resize"
import { modShortcut } from "@/lib/shortcuts"
import {
  editorPreferencesAtom,
  fileListAtom,
  fileVersionsAtom,
  readFileAtom,
  writeFileAtom,
} from "./atoms.ts"
import { EditorPane } from "./EditorPane.tsx"
import { EntryDialog, type EntryResult } from "./EntryDialog.tsx"
import { type EntryAction, isUnder, movedPath } from "./entries.ts"
import { FileSearch } from "./FileSearch.tsx"
import { FileTree } from "./FileTree.tsx"
import { QuickOpen } from "./QuickOpen.tsx"
import { onOpenFileRequest, takeOpenFileRequest } from "./openRequest.ts"
import { ancestorsOf, treeChanges } from "./tree.ts"
import { anyUnsaved, workspaceFor } from "./workspace.ts"

const POLL_MS = 2000
const NO_FILES: ReadonlyArray<string> = []
const lastListings = new Map<string, ReadonlyArray<string>>()
const TREE_MIN_WIDTH = 160
const TREE_DEFAULT_WIDTH = 240
const EDITOR_MIN_WIDTH = 240

let guarding = false

const guardUnsaved = () => {
  if (guarding) return
  guarding = true
  window.addEventListener("beforeunload", (event) => {
    if (anyUnsaved()) event.preventDefault()
  })
}

export default function FilesPanel({
  session,
  activity,
  onReference,
}: {
  readonly session: Session
  readonly activity: number
  readonly onReference?: ((reference: string) => void) | undefined
}) {
  const workspace = workspaceFor(session.id)
  const snapshot = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot)
  const readOnly = session.status === "ended"

  const read = useAtomSet(readFileAtom, { mode: "promiseExit" })
  const versions = useAtomSet(fileVersionsAtom, { mode: "promiseExit" })
  const write = useAtomSet(writeFileAtom, { mode: "promiseExit" })
  const listing = useAtomValue(fileListAtom(session.id))
  const diff = useAtomValue(sessionDiffAtom(session.id))
  const refreshListing = useAtomRefresh(fileListAtom(session.id))
  const refreshDiff = useAtomRefresh(sessionDiffAtom(session.id))
  const storedPreferences = useAtomValue(editorPreferencesAtom)
  const preferences = AsyncResult.isSuccess(storedPreferences)
    ? storedPreferences.value
    : DEFAULT_EDITOR_PREFERENCES

  workspace.connect(
    {
      read: (path) => read({ payload: { sessionId: session.id, path } }),
      versions: (paths) => versions({ payload: { sessionId: session.id, paths: [...paths] } }),
      write: (request) => write({ payload: { sessionId: session.id, ...request } }),
    },
    readOnly,
    preferences,
  )

  useEffect(guardUnsaved, [])

  useEffect(() => {
    refreshListing()
    refreshDiff()
    void workspace.poll()
  }, [activity, session.branch, session.worktreePath, refreshListing, refreshDiff, workspace])

  useEffect(() => {
    if (snapshot.revision === 0) return
    refreshListing()
    refreshDiff()
  }, [snapshot.revision, refreshListing, refreshDiff])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void workspace.poll()
    }
    const timer = window.setInterval(tick, POLL_MS)
    window.addEventListener("focus", tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", tick)
    }
  }, [workspace])

  const [treeShown, setTreeShown] = useStoredFlag("humanity.files-tree", true)
  const [finding, setFinding] = useState(false)
  const [searching, setSearching] = useState(false)
  const [entryAction, setEntryAction] = useState<EntryAction>()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault()
        setFinding(true)
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault()
        setTreeShown(true)
        setSearching(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setTreeShown])

  const editing = snapshot.tabs.open.length > 0
  const treeFills = treeShown && !editing
  useWidePanel(editing)
  const [treeWidth, setTreeWidth] = useStoredWidth("humanity.files-tree-width")
  const body = useRef<HTMLDivElement>(null)
  const treeColumn = useRef<HTMLDivElement>(null)

  const changes = useMemo(
    () => treeChanges(AsyncResult.isSuccess(diff) ? diff.value.files : []),
    [diff],
  )

  const open = (path: string) => {
    workspace.expand(ancestorsOf(path))
    workspace.open(path, { focus: true })
  }

  useEffect(() => {
    const take = () => {
      const path = takeOpenFileRequest(session.id)
      if (path === undefined) return
      workspace.expand(ancestorsOf(path))
      workspace.open(path, { focus: true })
    }
    take()
    return onOpenFileRequest((sessionId) => {
      if (sessionId === session.id) take()
    })
  }, [session.id, workspace])

  const fetched = AsyncResult.isSuccess(listing) ? listing.value.files : undefined
  useEffect(() => {
    if (fetched !== undefined) lastListings.set(session.worktreePath, fetched)
  }, [fetched, session.worktreePath])
  const previous = lastListings.get(session.worktreePath)
  const listed = fetched ?? previous ?? NO_FILES
  const tree = (files: ReadonlyArray<string>) => (
    <FileTree
      onAction={readOnly ? undefined : setEntryAction}
      files={files}
      changes={changes}
      active={snapshot.tabs.active}
      expanded={snapshot.expanded}
      onExpandedChange={(next) => workspace.setExpanded(next)}
      onOpen={(path) => workspace.open(path)}
      icons={preferences.fileIcons}
    />
  )
  const tracked = (path: string) =>
    listed.some((file) => isUnder(file, path) && changes.files.get(file) !== "create")

  const afterEntry = (result: EntryResult) => {
    refreshListing()
    refreshDiff()
    if (result.kind === "new") {
      open(result.path)
      return
    }
    const affected = snapshot.tabs.open.filter((path) =>
      isUnder(path, result.kind === "rename" ? result.from : result.path),
    )
    for (const path of affected) workspace.close(path)
    if (result.kind === "rename") {
      for (const path of affected) workspace.open(movedPath(path, result.from, result.to))
    }
  }

  return (
    <>
      <div
        className="titlebar flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3"
        style={{ paddingRight: titlebarPaddingEnd(RAIL_WIDTH) }}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <FolderTree className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">Files</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setFinding(true)}
            aria-label="Go to a file"
            title={`Go to a file (${modShortcut("P")})`}
          >
            <Search />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setTreeShown(true)
              setSearching(!searching)
            }}
            aria-label={searching ? "Show the tree" : "Search in files"}
            aria-pressed={searching}
            title={`Search in files (${modShortcut("Shift+F")})`}
          >
            <TextSearch />
          </Button>
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEntryAction({ kind: "new", folder: "" })}
              aria-label="New file"
              title="New file"
            >
              <FilePlus />
            </Button>
          )}
          {editing && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTreeShown(!treeShown)}
              aria-label={treeShown ? "Hide the tree" : "Show the tree"}
              aria-pressed={treeShown}
              title={treeShown ? "Hide the tree" : "Show the tree"}
            >
              <PanelLeft />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              refreshListing()
              refreshDiff()
              void workspace.poll()
            }}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw />
          </Button>
        </div>
      </div>
      <div ref={body} className="flex min-h-0 flex-1">
        {treeShown && (
          <div
            ref={treeColumn}
            className={cn(
              "relative flex min-h-0 flex-col",
              treeFills ? "min-w-0 flex-1" : "shrink-0 border-r",
            )}
            style={treeFills ? undefined : { width: treeWidth ?? TREE_DEFAULT_WIDTH }}
          >
            {searching ? (
              <FileSearch
                sessionId={session.id}
                icons={preferences.fileIcons}
                onReveal={(path, line, column, length) => {
                  workspace.expand(ancestorsOf(path))
                  workspace.reveal(path, line, column, length)
                }}
              />
            ) : (
              <AsyncView
                result={listing}
                errorTitle="Could not list the files"
                loading={previous === undefined ? undefined : tree(previous)}
              >
                {(value) => tree(value.files)}
              </AsyncView>
            )}
            {!treeFills && (
              <ResizeHandle
                edge="end"
                label="Resize the tree"
                value={treeWidth ?? undefined}
                min={TREE_MIN_WIDTH}
                max={() => (body.current?.offsetWidth ?? 0) - EDITOR_MIN_WIDTH}
                measure={() => treeColumn.current?.offsetWidth ?? TREE_DEFAULT_WIDTH}
                onResize={setTreeWidth}
                onReset={() => setTreeWidth(null)}
              />
            )}
          </div>
        )}
        {!treeFills && (
          <EditorPane
            workspace={workspace}
            snapshot={snapshot}
            readOnly={readOnly}
            icons={preferences.fileIcons}
            onReference={
              onReference === undefined
                ? undefined
                : (path) => onReference(workspace.referenceOf(path))
            }
          />
        )}
      </div>
      <EntryDialog
        sessionId={session.id}
        action={entryAction}
        files={listed}
        tracked={tracked}
        dirty={(path) =>
          snapshot.tabs.open.some((open) => isUnder(open, path) && workspace.isDirty(open))
        }
        onClose={() => setEntryAction(undefined)}
        onDone={afterEntry}
      />
      <QuickOpen
        sessionId={session.id}
        open={finding}
        recent={snapshot.tabs.open}
        onOpenChange={setFinding}
        onPick={open}
        icons={preferences.fileIcons}
      />
    </>
  )
}
