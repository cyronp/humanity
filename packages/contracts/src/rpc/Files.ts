import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  FileListing,
  FileSearchOptions,
  FileSearchResult,
  FileVersion,
  NewEntryKind,
  OpenedFile,
  SavedFile,
} from "../domain/Files.ts"
import { SessionId } from "../domain/Session.ts"
import {
  FileAccessFailed,
  FileChangedOnDisk,
  FileNotFound,
  FileRefused,
  GitCommandFailed,
  GitNotARepository,
  GitNotInstalled,
  SessionEnded,
  SessionNotFound,
} from "../Errors.ts"

export const FilesRpcs = RpcGroup.make(
  Rpc.make("Files.list", {
    payload: { sessionId: SessionId },
    success: FileListing,
    error: Schema.Union([SessionNotFound, GitNotARepository, GitNotInstalled, GitCommandFailed]),
  }),
  Rpc.make("Files.read", {
    payload: { sessionId: SessionId, path: Schema.String },
    success: OpenedFile,
    error: Schema.Union([SessionNotFound, FileRefused, FileNotFound, FileAccessFailed]),
  }),
  Rpc.make("Files.versions", {
    payload: { sessionId: SessionId, paths: Schema.Array(Schema.String) },
    success: Schema.Array(FileVersion),
    error: Schema.Union([SessionNotFound, FileRefused, FileAccessFailed]),
  }),
  Rpc.make("Files.write", {
    payload: {
      sessionId: SessionId,
      path: Schema.String,
      content: Schema.String,
      bom: Schema.Boolean,
      baseVersion: Schema.NullOr(Schema.String),
      overwrite: Schema.Boolean,
    },
    success: SavedFile,
    error: Schema.Union([
      SessionNotFound,
      SessionEnded,
      FileRefused,
      FileNotFound,
      FileChangedOnDisk,
      FileAccessFailed,
    ]),
  }),
  Rpc.make("Files.search", {
    payload: { sessionId: SessionId, options: FileSearchOptions },
    success: FileSearchResult,
    error: Schema.Union([SessionNotFound, GitNotInstalled, GitCommandFailed, FileRefused]),
  }),
  Rpc.make("Files.create", {
    payload: { sessionId: SessionId, path: Schema.String, kind: NewEntryKind },
    error: Schema.Union([
      SessionNotFound,
      SessionEnded,
      FileRefused,
      FileNotFound,
      FileAccessFailed,
    ]),
  }),
  Rpc.make("Files.rename", {
    payload: { sessionId: SessionId, from: Schema.String, to: Schema.String },
    error: Schema.Union([
      SessionNotFound,
      SessionEnded,
      FileRefused,
      FileNotFound,
      FileAccessFailed,
    ]),
  }),
  Rpc.make("Files.delete", {
    payload: { sessionId: SessionId, paths: Schema.Array(Schema.String) },
    error: Schema.Union([
      SessionNotFound,
      SessionEnded,
      FileRefused,
      FileNotFound,
      FileAccessFailed,
    ]),
  }),
)
