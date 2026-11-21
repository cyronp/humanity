import { DEFAULT_DESKTOP_PORT } from "@humanity/contracts"
import { join, resolve } from "node:path"

export const APP_USER_MODEL_ID = "dev.humanity.desktop"

export interface DesktopConfig {
  readonly dev: boolean
  readonly home: string
  readonly userDataDir: string
  readonly origin: string
  readonly authTokenPath: string
  readonly daemon:
    | {
        readonly executable: string
        readonly entry: string
        readonly env: Readonly<Record<string, string>>
      }
    | undefined
}

const VITE_ORIGIN = "http://127.0.0.1:5173"

const portFrom = (value: string | undefined): number => {
  const port = Number(value ?? DEFAULT_DESKTOP_PORT)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_DESKTOP_PORT
}

export const resolveDesktopConfig = (input: {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly homedir: string
  readonly execPath: string
  readonly isPackaged: boolean
  readonly resourcesPath: string
  readonly appPath: string
}): DesktopConfig => {
  const dev = input.env["HUMANITY_DESKTOP_DEV"] === "1"
  const home = resolve(input.env["HUMANITY_HOME"] ?? join(input.homedir, ".humanity"))
  const base = { dev, home, authTokenPath: join(home, "auth-token") }

  if (dev) {
    return {
      ...base,
      userDataDir: join(home, "desktop-dev"),
      origin: VITE_ORIGIN,
      daemon: undefined,
    }
  }

  const port = portFrom(input.env["HUMANITY_DESKTOP_PORT"])
  const daemonDir = input.isPackaged
    ? join(input.resourcesPath, "daemon")
    : join(input.appPath, "dist", "daemon")
  return {
    ...base,
    userDataDir: join(home, "desktop"),
    origin: `http://127.0.0.1:${port}`,
    daemon: {
      executable: input.execPath,
      entry: join(daemonDir, "main.mjs"),
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        HUMANITY_HOME: home,
        HUMANITY_PORT: String(port),
        HUMANITY_WEB_DIST: join(daemonDir, "web"),
        HUMANITY_EXIT_WITH_PARENT: "1",
        NODE_COMPILE_CACHE: join(home, "compile-cache"),
      },
    },
  }
}
