# Plan: a full browser

Last updated 2026-11-18. The spec (`docs/spec.md`, "Amendment: a full browser in the desktop app") is the source of truth; this plan is how we get there. It follows `terminals-and-browser.md`, whose phase 6 built the localhost preview in an iframe.

## Why

The human compared our Browser with t3code's ([pingdotgg/t3code](https://github.com/pingdotgg/t3code)). That one is a real Chromium `<webview>` in the desktop app, with a port scanner, device sizes, element picking, screenshots, annotations and recordings. The human wants all of it now, except the agent's browser tools.

## Decisions taken with the human

| Topic | Decision |
|---|---|
| Desktop engine | Electron's **`<webview>` tag**, hardened in `will-attach-webview` |
| A browser tab (not the desktop app) | Keeps the **iframe**, with every feature an iframe allows. The desktop-only features are hidden there, with a note that they need the desktop app. |
| Agent | **No browser tools** for now |
| Left out | Importing cookies from other browsers, voice notes on annotations, browser profiles, being the OS default browser |
| Port scan | **Yes.** This reverses "no port scan" in `terminals-and-browser.md`. |

## Decisions taken without the human (conservative; listed in the summaries)

- **Downloads:** a page's download never writes to disk, because the hard rule forbids writing outside `~/.humanity/` and the session's folder. It is cancelled and the address opens in the human's browser.
- **The address bar:** in the desktop app it takes any http(s) address but **does not search**: text that isn't an address is refused. `localhost:3000` still means `http://localhost:3000/`, and `example.com` means `https://example.com/`.
- **Humanity's own origin and ports** are refused in the webview too, at three points: when it attaches, when it navigates and when it opens a window. The preview's partition (`persist:humanity-preview`) is not the app's, so a framed Humanity would find no token anyway.
- **Which servers are listed:** only TCP listeners on loopback or every interface that answer HTTP, never Humanity's own. Each is tied to the terminal whose process tree started it. Tying a server to the agent waits until the agent's process id is known.
- **Stop server** only stops a `pid:port` pair the last scan listed: the whole process tree on Windows (`taskkill /T /F`), the process group elsewhere (TERM, then KILL after 3 s).
- **HTML and PDF files** are served by a second listener of the daemon, on `127.0.0.1` and a random port, under a random token per session, from inside that session's folder only. The daemon's own port never serves them, so a framed file is never same-origin with Humanity.
- **No guest preload.** Picking an element runs a script in the page with `executeJavaScript`, which isn't bound by the page's CSP and sees its React internals. The webview gets no preload of ours or the page's.

## Status

| Phase | What | State |
|---|---|---|
| 7 | Spec amendment and this plan | ✅ |
| 8 | Daemon: running servers, Stop server, blank-page probe, HTML/PDF files | ✅ |
| 9 | Panel: tabs, device sizes, zoom, link setting | ✅ checked in headless Edge |
| 10 | Desktop: the webview, the preload bridge, navigation, find, DevTools, appearance, mute, clear data, popups, downloads, crash recovery | ⏳ next |
| 11 | Capture: pick element, screenshot and annotate into the composer | |
| 12 | Recording and picture-in-picture | |

---

## Phase 8: the daemon

### Contracts (`packages/contracts`)

- **`domain/Preview.ts`:**
  - `LocalServer {host, port, url, pid, processName, terminalId | null}`.
  - `PreviewProbe {_tag: "Unreachable" | "Refuses" | "Ok", status?, reason?}`. "Refuses" means `X-Frame-Options` is `DENY`/`SAMEORIGIN`, or a CSP `frame-ancestors` doesn't allow us.
  - Pure parsers, so they can be tested: `parseNetstat`, `parseLsof`, `parseProcSockets`, `parseTasklist`, `parseCimProcesses`, `parsePs`, `framingOf(headers)`, `isPreviewFile(path)`.
- **`rpc/Preview.ts`:**
  - `Preview.servers({sessionId})`: a stream, scanned while somebody watches.
  - `Preview.stopServer({pid, port})`
  - `Preview.probe({url})`: only for an address `previewTarget` allows.
  - `Preview.fileUrl({sessionId, path})`

### Server (`apps/server/src/preview/`)

- **`PortScanner.ts`:**
  - Every 2 s while watched, it lists listeners: `netstat -ano -p TCP` (Windows), `lsof -nP -iTCP -sTCP:LISTEN -F pcn` (macOS), `/proc/net/tcp{,6}` with `/proc/*/fd` (Linux).
  - It reads parent PIDs (`Get-CimInstance Win32_Process` on Windows, `ps -A -o pid=,ppid=,comm=` elsewhere) only when a new PID appears.
  - It probes HTTP once per `pid:port`, with a 500 ms timeout.
  - It ties each server to a terminal through `PtyProcess.pid`, which the fake host gives too.
- **`PreviewService.ts`:** `servers`, `stopServer`, `probe` and `fileUrl`.
- **The file server:** a second `HttpServer` on `127.0.0.1:0` serves `/<token>/<path>` with GET only and no directory listing. The real path must stay inside the session's folder, and the content type follows the extension. Tokens live in memory and die with the session.

### Web

- **Running servers:** the Browser's empty state and its address menu list them, for example "`:5173` · node · Terminal 2", each with **Stop server**.
- **Badge:** a new server lights the rail's dot, like a printed URL.
- **Blank-page probe:** in the iframe, a load is followed by `Preview.probe`. An "Unreachable" or "Refuses" result replaces the generic footer with the reason.
- **Opening files:** "Open in Browser" on `.html`, `.htm` and `.pdf` files in the Changes tab and in `Read`/`Write`/`Edit` cards.

### Tests

- The parsers, on real output captured from each OS.
- `framingOf`, `isPreviewFile`.
- `PortScanner`, with a fake process runner: attribution, the HTTP filter, Humanity's ports.
- `stopServer` refuses a pair the scan doesn't list.
- The file server: path traversal, a symlink out of the folder, an unknown token, the content type.

## Phase 9: the panel

- **Tabs:** any number per thread, each `{id, url, title}`, kept in `localStorage` (`humanity.browser.<sessionId>`, replacing `{url, seen}`). A middle click closes a tab. Only the active tab is mounted in a browser tab; the desktop app keeps every tab's webview alive, hidden.
- **Device sizes** (`packages/contracts`, `PREVIEW_VIEWPORT_PRESETS`, t3code's 18):
  - "Fill" (the default), a preset with portrait or landscape, or a freeform size dragged by handles.
  - The frame is centred and scaled down when it doesn't fit.
  - Kept per tab.
- **Zoom:** 25–300 % in fixed steps. The iframe uses `transform: scale()`; the desktop app uses `setZoomFactor`.
- **Links:**
  - A middle click opens the human's browser, like Ctrl/Cmd.
  - Settings → Browser: "Open local links in: Browser panel / my browser" (`BrowserPreferences.linkTarget` in contracts, `Preferences.getBrowser`/`setBrowser`).

## Phase 10: the desktop webview

### Shell (`apps/desktop`)

- **The main window:**
  - `webviewTag: true`.
  - A preload, `src/preload.ts`, bundled by esbuild to `dist/preload.cjs`. It is sandboxed and exposes `window.humanityDesktop.preview` through `contextBridge`.
- **`will-attach-webview`:**
  - It drops any preload.
  - It forces `sandbox`, `contextIsolation`, no Node, no `webSecurity: false`, no `allowpopups` override, and the partition `persist:humanity-preview`.
  - It refuses a `src` on Humanity's origin or ports.
- **The guest's contents:**
  - `will-navigate`/`will-frame-navigate` refuse Humanity's origin.
  - `setWindowOpenHandler` sends http(s) addresses to the window as a new tab (`preview:open-tab`); anything else goes to `shell.openExternal`.
  - `session.will-download` cancels the download, opens the address outside and tells the window.
- **The bridge:** every call that names a guest checks `webContents.fromId(id).hostWebContents === event.sender`.
  - `setColorScheme(id, "light" | "dark" | "system")`: CDP `Emulation.setEmulatedMedia` over `webContents.debugger`.
  - `clearData()`: the preview partition's cookies, storage and cache.
  - `capture(id)` → PNG bytes
  - `mediaSourceId(id)`
  - `saveRecording(threadId, bytes)` → a path under `~/.humanity/recordings/`
  - `reveal(path)`, only for a path under `~/.humanity/recordings/`
  - `onOpenTab`, `onDownload`

### Web

- **`features/browser/surfaces/`:**
  - `IframeSurface`, today's frame.
  - `WebviewSurface`, chosen when `window.humanityDesktop` exists.
- **Navigation:**
  - Back, forward, stop, reload and hard reload (`reloadIgnoringCache`).
  - The address bar follows `did-navigate`/`did-navigate-in-page`.
  - The tab shows the title and favicon (`page-title-updated`, `page-favicon-updated`).
  - A loading bar, and a load-failed view (`did-fail-load`, ignoring `-3` aborted).
- **Find:** Ctrl+F in the panel, `findInPage` and `found-in-page`.
- **Tools:** DevTools (`openDevTools`), mute (`setAudioMuted`), appearance (light / dark / system), and "Clear cookies and cache" in a ⋯ menu.
- **Crash recovery:** `render-process-gone` reloads after 250 ms, 500 ms, then 1 s, at most 3 times in 30 s, then shows "This page crashed" with Reload.
- **Allowed addresses:** any http(s) address, via `previewTarget(input, refused, {anyHost: true})`.

## Phase 11: capture

- **Pick element:**
  - A crosshair button injects a script with `executeJavaScript`. It highlights the element under the pointer and resolves on click; Esc cancels.
  - It returns the page URL and title, a CSS selector, the trimmed `outerHTML` (2 KB), a dozen computed styles, the box, and the React component's name and source:
    - React ≤ 18: `_debugSource`
    - React 19: the first application frame of `_debugStack`
  - The composer receives it as a text block, for example "Element `<button.primary>` in `LoginForm` (`src/LoginForm.tsx:42`) on http://localhost:5173/login", with the HTML in a fenced block.
- **Screenshot:** `capture(id)` → PNG → an image attachment in the composer (`ComposerHandle.attach`).
- **Annotate:** the screenshot opens over the panel with a pen, an arrow, a box and text, in the theme's colours, plus Undo and Clear. "Add to message" attaches the drawn image.

## Phase 12: recording and picture-in-picture

- **Recording:**
  - `mediaSourceId(id)` → `getUserMedia({video: {mandatory: {chromeMediaSource: "tab", chromeMediaSourceId}}})` → `MediaRecorder` (WebM, VP9, 30 fps).
  - It stops at 50 MB or 10 minutes, then calls `saveRecording`.
  - The panel shows the saved file with Reveal.
- **Picture-in-picture:** the same stream in a hidden `<video>` → `requestPictureInPicture()`. It mirrors the tab and stops with it.

---

## Verification, end to end

Each phase must pass `npm run lint`, `npm run typecheck` and `npm run test`, then be committed (as the user, without trailers).

1. **Servers:** start `npm run dev` of any Vite app in a terminal. It appears in the Browser with its terminal's name, and **Stop server** stops it.
2. **Blank page:** a server that sends `X-Frame-Options: DENY` shows why in a browser tab.
3. **Files:** an `.html` file from the Changes tab opens in the Browser, and its relative CSS loads. A `.pdf` file opens too.
4. **Tabs and sizes:** two tabs, an iPhone preset rotated, 50 % zoom. Reloading the page keeps them all.
5. **Desktop:**
   - Back and forward, the title and favicon, DevTools.
   - Find, appearance dark, mute.
   - A `target=_blank` link opens a tab.
   - A download opens outside.
   - Killing the guest's renderer reloads it.
6. **Capture:** pick a button in a React app; the composer names its component and file. A screenshot and an annotated screenshot attach.
7. **Recording:** record 5 s; the file is under `~/.humanity/recordings/` and plays. Picture-in-picture follows the page.

## Risks

- **`<webview>` focus and keyboard:** keys pressed in the guest never reach the app's shortcuts (Ctrl+` and so on). Forwarding the app's own shortcuts from the guest may be needed (t3code has `setForwardedShortcuts`).
- **WebGL and memory:** each webview is a renderer process, so many tabs cost memory. Hidden tabs could be discarded after a while.
- **CDP and DevTools:** both attach to the same page. Chromium accepts several clients, but `setEmulatedMedia` may need re-sending after DevTools closes.
- **Windows process listing:** `Get-CimInstance` takes about 0.5 s, so it only runs when a new PID appears.
