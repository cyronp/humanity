import {
  type DesktopPreviewBridge,
  type HumanityDesktop,
  PREVIEW_CHANNELS,
  type PreviewDownload,
  type PreviewOpenTab,
} from "@humanity/contracts"
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"

const subscribe =
  <T>(channel: string) =>
  (listener: (value: T) => void) => {
    const handler = (_event: IpcRendererEvent, value: T) => listener(value)
    ipcRenderer.on(channel, handler)
    return () => void ipcRenderer.removeListener(channel, handler)
  }

const preview: DesktopPreviewBridge = {
  setColorScheme: (guest, scheme) =>
    ipcRenderer.invoke(PREVIEW_CHANNELS.setColorScheme, guest, scheme),
  clearData: () => ipcRenderer.invoke(PREVIEW_CHANNELS.clearData),
  capture: (guest) => ipcRenderer.invoke(PREVIEW_CHANNELS.capture, guest),
  prepareCapture: (guest) => ipcRenderer.invoke(PREVIEW_CHANNELS.prepareCapture, guest),
  saveRecording: (threadId, data) =>
    ipcRenderer.invoke(PREVIEW_CHANNELS.saveRecording, threadId, data),
  reveal: (path) => ipcRenderer.invoke(PREVIEW_CHANNELS.reveal, path),
  onOpenTab: subscribe<PreviewOpenTab>(PREVIEW_CHANNELS.openTab),
  onDownload: subscribe<PreviewDownload>(PREVIEW_CHANNELS.download),
}

const desktop: HumanityDesktop = { preview }

contextBridge.exposeInMainWorld("humanityDesktop", desktop)
