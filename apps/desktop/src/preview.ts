import {
  PREVIEW_CHANNELS,
  PREVIEW_PARTITION,
  type PreviewColorScheme,
  type PreviewDownload,
  type PreviewOpenTab,
  type PreviewShortcut,
} from "@humanity/contracts"
import {
  ipcMain,
  type IpcMainInvokeEvent,
  session,
  shell,
  type WebContents,
  webContents,
} from "electron"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { guestDestinationOf, isAppShortcut, isRecording, recordingPath } from "./previewRules.ts"

const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write", "fullscreen"])

const CAPTURE_WINDOW_MS = 5_000

export const installPreview = (options: {
  readonly appOrigin: string
  readonly home: string
  readonly isAppContents: (contents: WebContents) => boolean
}) => {
  const { appOrigin, home } = options
  const partition = session.fromPartition(PREVIEW_PARTITION)

  partition.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(ALLOWED_PERMISSIONS.has(permission)),
  )
  partition.setPermissionCheckHandler((_contents, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  )
  partition.on("will-download", (event, item, contents) => {
    event.preventDefault()
    const url = item.getURL()
    if (url.startsWith("http:") || url.startsWith("https:")) void shell.openExternal(url)
    const download: PreviewDownload = { url, fileName: item.getFilename() }
    contents.hostWebContents?.send(PREVIEW_CHANNELS.download, download)
  })

  const hardenHost = (host: WebContents) => {
    host.on("will-attach-webview", (event, webPreferences, params) => {
      delete webPreferences.preload
      webPreferences.nodeIntegration = false
      webPreferences.nodeIntegrationInSubFrames = false
      webPreferences.contextIsolation = true
      webPreferences.sandbox = true
      webPreferences.webSecurity = true
      webPreferences.allowRunningInsecureContent = false
      webPreferences.partition = PREVIEW_PARTITION
      params.partition = PREVIEW_PARTITION
      if (guestDestinationOf(params.src ?? "", appOrigin) !== "page") event.preventDefault()
    })
  }

  const confineGuest = (guest: WebContents) => {
    const refuse = (event: { preventDefault: () => void }, url: string) => {
      const destination = guestDestinationOf(url, appOrigin)
      if (destination === "page") return
      event.preventDefault()
      if (destination === "external") void shell.openExternal(url)
    }
    guest.on("will-navigate", (event, url) => refuse(event, url))
    guest.on("will-frame-navigate", (event) => refuse(event, event.url))
    guest.on("will-redirect", (event, url) => refuse(event, url))
    guest.setWindowOpenHandler(({ url }) => {
      const destination = guestDestinationOf(url, appOrigin)
      if (destination === "page" && url !== "about:blank") {
        const request: PreviewOpenTab = { url }
        guest.hostWebContents?.send(PREVIEW_CHANNELS.openTab, request)
      } else if (destination === "external") {
        void shell.openExternal(url)
      }
      return { action: "deny" }
    })
    guest.on("before-input-event", (event, input) => {
      if (!isAppShortcut(input, process.platform === "darwin")) return
      event.preventDefault()
      const shortcut: PreviewShortcut = {
        guest: guest.id,
        key: input.key,
        code: input.code,
        ctrlKey: input.control,
        shiftKey: input.shift,
        altKey: input.alt,
        metaKey: input.meta,
      }
      guest.hostWebContents?.send(PREVIEW_CHANNELS.shortcut, shortcut)
    })
  }

  const guestOf = (event: IpcMainInvokeEvent, id: unknown): WebContents => {
    if (!options.isAppContents(event.sender)) throw new Error("Not the app's window.")
    const guest = typeof id === "number" ? webContents.fromId(id) : undefined
    if (
      guest === undefined ||
      guest.getType() !== "webview" ||
      guest.hostWebContents !== event.sender
    ) {
      throw new Error("Not a page of this window's Browser.")
    }
    return guest
  }

  const appOnly = (event: IpcMainInvokeEvent) => {
    if (!options.isAppContents(event.sender)) throw new Error("Not the app's window.")
  }

  ipcMain.handle(PREVIEW_CHANNELS.setColorScheme, async (event, id: unknown, scheme: unknown) => {
    const guest = guestOf(event, id)
    const value: PreviewColorScheme = scheme === "light" || scheme === "dark" ? scheme : "system"
    if (!guest.debugger.isAttached()) guest.debugger.attach("1.3")
    await guest.debugger.sendCommand("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: value === "system" ? "" : value }],
    })
  })

  ipcMain.handle(PREVIEW_CHANNELS.clearData, async (event) => {
    appOnly(event)
    await partition.clearStorageData()
    await partition.clearCache()
  })

  ipcMain.handle(PREVIEW_CHANNELS.capture, async (event, id: unknown) => {
    const image = await guestOf(event, id).capturePage()
    return new Uint8Array(image.toPNG())
  })

  const captures = new Map<number, { readonly guest: WebContents; readonly until: number }>()

  ipcMain.handle(PREVIEW_CHANNELS.prepareCapture, (event, id: unknown) => {
    captures.set(event.sender.id, {
      guest: guestOf(event, id),
      until: Date.now() + CAPTURE_WINDOW_MS,
    })
  })

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const host = request.frame === null ? undefined : webContents.fromFrame(request.frame)
    const capture = host === undefined ? undefined : captures.get(host.id)
    if (host !== undefined) captures.delete(host.id)
    if (
      host === undefined ||
      capture === undefined ||
      !options.isAppContents(host) ||
      Date.now() > capture.until ||
      capture.guest.isDestroyed()
    ) {
      callback(null)
      return
    }
    callback({ video: capture.guest.mainFrame })
  })

  ipcMain.handle(
    PREVIEW_CHANNELS.saveRecording,
    async (event, threadId: unknown, data: unknown) => {
      appOnly(event)
      if (typeof threadId !== "string" || !(data instanceof Uint8Array)) {
        throw new Error("Not a recording.")
      }
      const target = recordingPath(home, threadId, data.byteLength, new Date())
      if ("refused" in target) throw new Error(target.refused)
      await mkdir(dirname(target.path), { recursive: true })
      await writeFile(target.path, data)
      return target.path
    },
  )

  ipcMain.handle(PREVIEW_CHANNELS.reveal, (event, path: unknown) => {
    appOnly(event)
    if (typeof path !== "string" || !isRecording(home, path)) throw new Error("Not a recording.")
    shell.showItemInFolder(path)
  })

  return { hardenHost, confineGuest }
}
