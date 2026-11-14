import { DEFAULT_DESKTOP_PORT } from "@humanity/contracts"
import { join, resolve } from "node:path"

export interface DesktopConfig {
  /** True under `npm run dev:desktop`: the daemon and Vite are already running. */
  readonly dev: boolean
  /** Humanity's data directory, the same one the daemon uses. */
  readonly home: string
  /** Chromium's profile. Kept inside `home` so the app writes nowhere else. */
  readonly userDataDir: string
  /** Where the window loads the web app from. Its `/api/auth` tells when the daemon is up. */
  readonly origin: string
  readonly authTokenPath: string
  /** The daemon to start. `undefined` in development, where one is already running. */
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

/**
 * Everything the app derives from its surroundings, in one place.
 *
 * The daemon gets a port of its own, apart from the one `npm run dev` and
 * `npm start` use, and always the same one: the web app keeps its token and
 * preferences in localStorage, which belongs to the origin.
 */
export const resolveDesktopConfig = (input: {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly homedir: string
  /** The Electron executable, which also runs the daemon as plain Node. */
  readonly execPath: string
  readonly isPackaged: boolean
  /** Electron's resources folder; the daemon ships there in a packaged app. */
  readonly resourcesPath: string
  /** The app's own folder: `apps/desktop` when run from the repository. */
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
      },
    },
  }
}
