import { Schema } from "effect"

export const FILE_OPEN_LIMIT_BYTES = 2 * 1024 * 1024

export const FileListing = Schema.Struct({
  files: Schema.Array(Schema.String),
})
export type FileListing = typeof FileListing.Type

export const OpenedFile = Schema.Union([
  Schema.TaggedStruct("Text", {
    path: Schema.String,
    content: Schema.String,
    version: Schema.String,
    bom: Schema.Boolean,
  }),
  Schema.TaggedStruct("Binary", { path: Schema.String, size: Schema.Number }),
  Schema.TaggedStruct("TooLarge", { path: Schema.String, size: Schema.Number }),
])
export type OpenedFile = typeof OpenedFile.Type

export const FileVersion = Schema.Struct({
  path: Schema.String,
  version: Schema.NullOr(Schema.String),
})
export type FileVersion = typeof FileVersion.Type

export const SavedFile = Schema.Struct({
  path: Schema.String,
  version: Schema.String,
})
export type SavedFile = typeof SavedFile.Type

const segmentsOf = (path: string) => path.split("/")

export const workspacePathProblem = (path: string): string | undefined => {
  if (path.trim() === "") return "No file was named."
  if (path.includes("\0")) return "The path has a NUL character."
  if (path.includes("\\")) return "Paths use forward slashes."
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    return "The path must be relative to the thread's folder."
  }
  const segments = segmentsOf(path)
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "The path must stay inside the thread's folder."
  }
  if (segments.some((segment) => segment.toLowerCase() === ".git")) {
    return "Files under .git are git's own and are not opened here."
  }
  return undefined
}
