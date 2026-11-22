declare const __HUMANITY_VERSION__: string

export const APP_VERSION: string | undefined =
  typeof __HUMANITY_VERSION__ === "string" ? __HUMANITY_VERSION__ : undefined

export const REPOSITORY_URL = "https://github.com/cyronp/humanity"
export const RELEASES_URL = `${REPOSITORY_URL}/releases`
export const DOCS_URL = `${REPOSITORY_URL}#readme`
export const NEW_ISSUE_URL = `${REPOSITORY_URL}/issues/new`
