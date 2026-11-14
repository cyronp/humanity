import { NodeServices } from "@effect/platform-node"
import { TOKEN_PARAM } from "@humanity/contracts"
import { Deferred, Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient } from "effect/http"
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  dialog,
  nativeTheme,
  shell,
  type WebContents,
} from "electron"
import { mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { resolveDesktopConfig } from "./config.ts"
import { supervise } from "./daemon.ts"
import { appUrl, destinationOf } from "./navigation.ts"
import { isDarkColor, titleBarOverlay } from "./titlebar.ts"

const config = resolveDesktopConfig({
  env: process.env,
  homedir: homedir(),
  execPath: process.execPath,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appPath: app.getAppPath(),
})

// Before anything else: the instance lock and Chromium's profile both live there.
mkdirSync(config.userDataDir, { recursive: true })
app.setPath("userData", config.userDataDir)

const SPLASH = `data:text/html;charset=utf-8,${encodeURIComponent(
  `<!doctype html><meta charset="utf-8"><title>Humanity</title>
  <style>
    html { color-scheme: light dark; }
    body { margin: 0; height: 100vh; display: grid; place-items: center;
      font: 14px system-ui, sans-serif; opacity: 0.7; }
  </style>
  <body>Starting Humanity…</body>`,
)}`

/**
 * No title bar of the system's: the web app's own top bar takes its place, and
 * the window buttons are drawn over its right end. macOS keeps its title bar
 * for now, where the buttons would land on the sidebar's left end instead.
 */
const ownsTitleBar = process.platform !== "darwin"
const frame = (): BrowserWindowConstructorOptions =>
  ownsTitleBar
    ? { titleBarStyle: "hidden", titleBarOverlay: titleBarOverlay(nativeTheme.shouldUseDarkColors) }
    : {}

let window: BrowserWindow | undefined
let daemonReady = false

const loadApp = () => {
  if (window === undefined) return
  const token = readFileSync(config.authTokenPath, "utf8").trim()
  void window.loadURL(appUrl(config.origin, TOKEN_PARAM, token))
}

const createWindow = () => {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 560,
    title: "Humanity",
    autoHideMenuBar: true,
    ...frame(),
    // A packaged app takes its icon from the executable.
    ...(app.isPackaged ? {} : { icon: join(app.getAppPath(), "build", "icon.png") }),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  const created = window
  // The page says which theme it is in; the window buttons follow it.
  created.webContents.on("did-change-theme-color", (_event, color) => {
    const dark = isDarkColor(color)
    if (ownsTitleBar && dark !== undefined) created.setTitleBarOverlay(titleBarOverlay(dark))
  })
  window.on("closed", () => {
    window = undefined
  })
  if (daemonReady) loadApp()
  else void window.loadURL(SPLASH)
}

/** The page only ever shows Humanity; every other link opens in the human's browser. */
const confine = (contents: WebContents) => {
  contents.on("will-navigate", (event, url) => {
    const destination = destinationOf(url, config.origin)
    if (destination === "app") return
    event.preventDefault()
    if (destination === "external") void shell.openExternal(url)
  })
  contents.setWindowOpenHandler(({ url }) => {
    const destination = destinationOf(url, config.origin)
    if (destination === "external") void shell.openExternal(url)
    return destination === "app"
      ? {
          action: "allow",
          overrideBrowserWindowOptions: {
            // A tab the page opened is not the app: it gets an ordinary window.
            titleBarStyle: "default",
            autoHideMenuBar: true,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
          },
        }
      : { action: "deny" }
  })
}

const start = () => {
  const runtime = ManagedRuntime.make(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer))
  const stop = Effect.runSync(Deferred.make<void>())

  /** Resolves once the daemon is gone: with what it last printed if it never came up. */
  const supervision = runtime.runPromise(
    supervise({
      daemon: config.daemon,
      readinessUrl: `${config.origin}/api/auth`,
      stop,
      onOutput: (chunk) => process.stdout.write(chunk),
      onReady: Effect.sync(() => {
        // A daemon that came back after a crash is found again by the page itself.
        if (daemonReady) return
        daemonReady = true
        loadApp()
      }),
    }).pipe(
      Effect.match({
        onSuccess: () => undefined,
        onFailure: (failure) => failure.output.trim(),
      }),
    ),
  )

  let finished = false
  void supervision.then((output) => {
    finished = true
    if (output === undefined) return
    dialog.showErrorBox(
      "Humanity could not start",
      `Its daemon did not come up on ${config.origin}.\n\n${output}`,
    )
    app.quit()
  })

  // Quitting waits for the daemon, so it can stop its agents and close the database.
  app.on("before-quit", (event) => {
    if (finished) return
    event.preventDefault()
    Effect.runSync(Deferred.succeed(stop, undefined))
    void supervision.then(() => app.quit())
  })

  app.on("web-contents-created", (_event, contents) => confine(contents))
  app.on("second-instance", () => {
    if (window === undefined) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
  })
  app.on("activate", () => {
    if (window === undefined) createWindow()
  })

  void app.whenReady().then(createWindow)
}

if (app.requestSingleInstanceLock()) start()
else app.quit()
