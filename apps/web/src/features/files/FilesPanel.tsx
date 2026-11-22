import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { DEFAULT_EDITOR_PREFERENCES, type Session } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { FolderTree, PanelLeft, PanelRightClose, RefreshCw, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ResizeHandle } from "@/components/ResizeHandle"
import { Button } from "@/components/ui/button"
import { sessionDiffAtom } from "@/features/session/atoms"
import { RAIL_WIDTH, titlebarPaddingEnd } from "@/features/session/panel/SessionPanel"
import { useStoredFlag } from "@/features/terminal/dock"
import { useStoredWidth } from "@/lib/resize"
import {
  editorPreferencesAtom,
  fileListAtom,
  fileVersionsAtom,
  readFileAtom,
  writeFileAtom,
} from "./atoms.ts"
import { EditorPane } from "./EditorPane.tsx"
import { FileTree } from "./FileTree.tsx"
import { QuickOpen } from "./QuickOpen.tsx"
import { ancestorsOf, treeChanges } from "./tree.ts"
import { anyUnsaved, workspaceFor } from "./workspace.ts"

const POLL_MS = 2000
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
  onClose,
  onReference,
}: {
  readonly session: Session
  readonly activity: number
  readonly onClose: () => void
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

  const [finding, setFinding] = useState(false)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault()
        setFinding(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const [treeShown, setTreeShown] = useStoredFlag("humanity.files-tree", true)
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
            title="Go to a file (Ctrl+P)"
          >
            <Search />
          </Button>
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close the panel"
            title="Close the panel"
          >
            <PanelRightClose />
          </Button>
        </div>
      </div>
      <div ref={body} className="flex min-h-0 flex-1">
        {treeShown && (
          <div
            ref={treeColumn}
            className="relative flex min-h-0 shrink-0 flex-col border-r"
            style={{ width: treeWidth ?? TREE_DEFAULT_WIDTH }}
          >
            <AsyncView result={listing} errorTitle="Could not list the files">
              {(value) => (
                <FileTree
                  files={value.files}
                  changes={changes}
                  active={snapshot.tabs.active}
                  expanded={snapshot.expanded}
                  onExpandedChange={(next) => workspace.setExpanded(next)}
                  onOpen={(path) => workspace.open(path)}
                  icons={preferences.fileIcons}
                />
              )}
            </AsyncView>
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
          </div>
        )}
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
      </div>
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
