import { Effect, Schema } from "effect"

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

export const FileSearchOptions = Schema.Struct({
  query: Schema.String,
  caseSensitive: Schema.Boolean,
  wholeWord: Schema.Boolean,
  regex: Schema.Boolean,
  include: Schema.optional(Schema.String),
  exclude: Schema.optional(Schema.String),
})
export type FileSearchOptions = typeof FileSearchOptions.Type

export const FileSearchMatch = Schema.Struct({
  line: Schema.Number,
  column: Schema.Number,
  preview: Schema.String,
})
export type FileSearchMatch = typeof FileSearchMatch.Type

export const FileSearchResult = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({ path: Schema.String, matches: Schema.Array(FileSearchMatch) }),
  ),
  matches: Schema.Number,
  truncated: Schema.Boolean,
})
export type FileSearchResult = typeof FileSearchResult.Type

export const FILE_SEARCH_LIMITS = { matches: 2000, perFile: 100, preview: 200 } as const

export const NewEntryKind = Schema.Literals(["file", "folder"])
export type NewEntryKind = typeof NewEntryKind.Type

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

export const EditorAutoSave = Schema.Literals(["off", "afterDelay", "onFocusChange"])
export type EditorAutoSave = typeof EditorAutoSave.Type

export const EDITOR_FONT_SIZES = { min: 8, max: 32 } as const
export const EDITOR_TAB_SIZES = { min: 1, max: 8 } as const
export const EDITOR_AUTO_SAVE_DELAYS = { min: 100, max: 60_000 } as const

const withDefault = <S extends Schema.Top & { readonly "~type.make": unknown }>(
  schema: S,
  value: S["Type"],
) => schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(value)))

export const EditorPreferences = Schema.Struct({
  autoSave: withDefault(EditorAutoSave, "off"),
  autoSaveDelay: withDefault(
    Schema.Int.check(
      Schema.isBetween({
        minimum: EDITOR_AUTO_SAVE_DELAYS.min,
        maximum: EDITOR_AUTO_SAVE_DELAYS.max,
      }),
    ),
    1000,
  ),
  fontFamily: withDefault(Schema.NullOr(Schema.String), null),
  fontSize: withDefault(
    Schema.Int.check(
      Schema.isBetween({ minimum: EDITOR_FONT_SIZES.min, maximum: EDITOR_FONT_SIZES.max }),
    ),
    13,
  ),
  tabSize: withDefault(
    Schema.Int.check(
      Schema.isBetween({ minimum: EDITOR_TAB_SIZES.min, maximum: EDITOR_TAB_SIZES.max }),
    ),
    2,
  ),
  insertSpaces: withDefault(Schema.Boolean, true),
  detectIndentation: withDefault(Schema.Boolean, true),
  wordWrap: withDefault(Schema.Boolean, false),
  lineNumbers: withDefault(Schema.Boolean, true),
  fileIcons: withDefault(Schema.Boolean, true),
})
export type EditorPreferences = typeof EditorPreferences.Type

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  autoSave: "off",
  autoSaveDelay: 1000,
  fontFamily: null,
  fontSize: 13,
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: true,
  wordWrap: false,
  lineNumbers: true,
  fileIcons: true,
}
