import { DEFAULT_DAEMON_PORT, DEFAULT_DESKTOP_PORT } from "@humanity/contracts"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { APP_USER_MODEL_ID, resolveDesktopConfig } from "../src/config.ts"

const input = {
  env: {},
  homedir: resolve("/home/ada"),
  execPath: resolve("/opt/Humanity/humanity"),
  isPackaged: true,
  resourcesPath: resolve("/opt/Humanity/resources"),
  appPath: resolve("/opt/Humanity/resources/app.asar"),
}
const home = join(input.homedir, ".humanity")
const daemonDir = join(input.resourcesPath, "daemon")

describe("resolveDesktopConfig", () => {
  it("starts the packaged daemon on the desktop port, inside Humanity's home", () => {
    const config = resolveDesktopConfig(input)
    expect(config).toEqual({
      dev: false,
      home,
      userDataDir: join(home, "desktop"),
      authTokenPath: join(home, "auth-token"),
      origin: `http://127.0.0.1:${DEFAULT_DESKTOP_PORT}`,
      daemon: {
        executable: input.execPath,
        entry: join(daemonDir, "main.mjs"),
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          HUMANITY_HOME: home,
          HUMANITY_PORT: String(DEFAULT_DESKTOP_PORT),
          HUMANITY_WEB_DIST: join(daemonDir, "web"),
          HUMANITY_EXIT_WITH_PARENT: "1",
          NODE_COMPILE_CACHE: join(home, "compile-cache"),
        },
      },
    })
  })

  it("keeps its port apart from the one the daemon uses on its own", () => {
    expect(DEFAULT_DESKTOP_PORT).not.toBe(DEFAULT_DAEMON_PORT)
  })

  it("finds the daemon in the build output when run from the repository", () => {
    const appPath = resolve("/repo/apps/desktop")
    const config = resolveDesktopConfig({ ...input, isPackaged: false, appPath })
    expect(config.daemon?.entry).toBe(join(appPath, "dist", "daemon", "main.mjs"))
  })

  it("honors HUMANITY_HOME and HUMANITY_DESKTOP_PORT", () => {
    const custom = resolve("/data/humanity")
    const config = resolveDesktopConfig({
      ...input,
      env: { HUMANITY_HOME: custom, HUMANITY_DESKTOP_PORT: "7555" },
    })
    expect(config.userDataDir).toBe(join(custom, "desktop"))
    expect(config.origin).toBe("http://127.0.0.1:7555")
    expect(config.daemon?.env["HUMANITY_HOME"]).toBe(custom)
    expect(config.daemon?.env["HUMANITY_PORT"]).toBe("7555")
  })

  it.each(["0", "70000", "abc", ""])("falls back to the default port for %j", (value) => {
    const config = resolveDesktopConfig({ ...input, env: { HUMANITY_DESKTOP_PORT: value } })
    expect(config.origin).toBe(`http://127.0.0.1:${DEFAULT_DESKTOP_PORT}`)
  })

  it("starts no daemon in development and opens the Vite dev server", () => {
    const config = resolveDesktopConfig({ ...input, env: { HUMANITY_DESKTOP_DEV: "1" } })
    expect(config.daemon).toBeUndefined()
    expect(config.origin).toBe("http://127.0.0.1:5173")
    expect(config.userDataDir).toBe(join(home, "desktop-dev"))
  })
})

describe("the Windows app id", () => {
  it("is the installer's, so notifications carry Humanity's name and icon", () => {
    const builder = readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8")
    expect(builder.split(/\r?\n/)).toContain(`appId: ${APP_USER_MODEL_ID}`)
  })
})
