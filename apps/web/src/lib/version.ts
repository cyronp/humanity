declare const __HUMANITY_VERSION__: string

/**
 * The app's version, the desktop app's, put in by Vite at build time. Code
 * Vite does not build, like the tests, has none.
 */
export const APP_VERSION: string | undefined =
  typeof __HUMANITY_VERSION__ === "string" ? __HUMANITY_VERSION__ : undefined
