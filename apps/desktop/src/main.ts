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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import brandMark from "../../web/public/favicon.svg"
import { APP_NAME, APP_USER_MODEL_ID, resolveDesktopConfig } from "./config.ts"
import { supervise } from "./daemon.ts"
import { makeElectronUpdater } from "./electronUpdater.ts"
import { appUrl, destinationOf } from "./navigation.ts"
import { installPreview } from "./preview.ts"
import { backdropColor, splashUrl } from "./splash.ts"
import { isDarkColor, titleBarOverlay } from "./titlebar.ts"
import { connectUpdates } from "./updatesClient.ts"

app.setName(APP_NAME)

const config = resolveDesktopConfig({
  env: process.env,
  homedir: homedir(),
  execPath: process.execPath,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appPath: app.getAppPath(),
})

if (process.platform === "win32" && app.isPackaged) app.setAppUserModelId(APP_USER_MODEL_ID)

mkdirSync(config.userDataDir, { recursive: true })
app.setPath("userData", config.userDataDir)

const themePath = join(config.userDataDir, "theme")
let dark = nativeTheme.shouldUseDarkColors
try {
  const remembered = readFileSync(themePath, "utf8").trim()
  if (remembered === "dark" || remembered === "light") dark = remembered === "dark"
} catch {}

const ownsTitleBar = process.platform !== "darwin"
const frame = (): BrowserWindowConstructorOptions =>
  ownsTitleBar ? { titleBarStyle: "hidden", titleBarOverlay: titleBarOverlay(dark) } : {}

let window: BrowserWindow | undefined
let daemonReady = false

const readToken = () => readFileSync(config.authTokenPath, "utf8").trim()

const loadApp = () => {
  if (window === undefined) return
  void window.loadURL(appUrl(config.origin, TOKEN_PARAM, readToken()))
}

const updatesUnsupported = (): string | undefined => {
  if (!app.isPackaged) return "This is a development build. Updates install in the packaged app."
  if (process.platform !== "win32") return "Updates are not available on this system yet."
  return undefined
}

const createWindow = () => {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 560,
    title: APP_NAME,
    autoHideMenuBar: true,
    backgroundColor: backdropColor(dark),
    ...frame(),
    ...(app.isPackaged ? {} : { icon: join(app.getAppPath(), "build", "icon.png") }),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      preload: join(app.getAppPath(), "dist", "preload.cjs"),
    },
  })
  const created = window
  created.webContents.on("did-change-theme-color", (_event, color) => {
    const pageDark = isDarkColor(color)
    if (pageDark === undefined) return
    if (ownsTitleBar) created.setTitleBarOverlay(titleBarOverlay(pageDark))
    if (pageDark === dark) return
    dark = pageDark
    created.setBackgroundColor(backdropColor(dark))
    writeFileSync(themePath, dark ? "dark" : "light")
  })
  window.on("closed", () => {
    window = undefined
  })
  if (daemonReady) loadApp()
  else void window.loadURL(splashUrl(brandMark, dark))
}

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

  let updatesStarted = false
  const startUpdates = () => {
    if (updatesStarted) return
    updatesStarted = true
    const unsupported = updatesUnsupported()
    runtime.runFork(
      connectUpdates({
        origin: config.origin,
        readToken,
        version: app.getVersion(),
        unsupported: unsupported ?? "",
        updater:
          unsupported === undefined
            ? makeElectronUpdater({
                cacheBase: join(config.home, "updates"),
                beforeInstall: stopDaemon,
              })
            : undefined,
      }),
    )
  }

  const supervision = runtime.runPromise(
    supervise({
      daemon: config.daemon,
      readinessUrl: `${config.origin}/api/auth`,
      stop,
      onOutput: (chunk) => process.stdout.write(chunk),
      onReady: Effect.sync(() => {
        if (daemonReady) return
        daemonReady = true
        loadApp()
        startUpdates()
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
      `${APP_NAME} could not start`,
      `Its daemon did not come up on ${config.origin}.\n\n${output}`,
    )
    app.quit()
  })

  const stopDaemon = async () => {
    Effect.runSync(Deferred.succeed(stop, undefined))
    await supervision
  }

  app.on("before-quit", (event) => {
    if (finished) return
    event.preventDefault()
    void stopDaemon().then(() => app.quit())
  })

  app.on("browser-window-created", (_event, created) => {
    created.setTitle(APP_NAME)
    created.on("page-title-updated", (event) => event.preventDefault())
  })

  let preview: ReturnType<typeof installPreview> | undefined
  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() === "webview") {
      preview?.confineGuest(contents)
      return
    }
    confine(contents)
    preview?.hardenHost(contents)
  })
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

  void app.whenReady().then(() => {
    preview = installPreview({
      appOrigin: config.origin,
      home: config.home,
      isAppContents: (contents) => contents === window?.webContents,
    })
    createWindow()
  })
}

if (app.requestSingleInstanceLock()) start()
else app.quit()
