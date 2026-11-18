declare const __HUMANITY_VERSION__: string

export const APP_VERSION: string | undefined =
  typeof __HUMANITY_VERSION__ === "string" ? __HUMANITY_VERSION__ : undefined
