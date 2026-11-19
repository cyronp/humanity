import { isPreviewFile, PreviewFileRefused, SessionNotFound } from "@humanity/contracts"
import { Context, Effect, Layer, Option } from "effect"
import { randomBytes } from "node:crypto"
import { createReadStream } from "node:fs"
import { realpath, stat } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { extname, isAbsolute, relative, resolve, sep } from "node:path"
import { SessionRepo } from "../db/SessionRepo.ts"

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
}

export const contentTypeOf = (path: string): string =>
  TYPES[extname(path).toLowerCase()] ?? "application/octet-stream"

/** Whether `child` is `folder` or inside it. Both must already be real paths. */
export const isInside = (folder: string, child: string): boolean => {
  const path = relative(folder, child)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

/**
 * Serves the HTML and PDF files of a thread's folder, with what they load beside them, on a port of
 * its own: never the daemon's, so a framed file is never same-origin with Humanity. Each thread
 * gets a random token that lives in memory; nothing outside its folder is ever served.
 */
export class PreviewFiles extends Context.Service<
  PreviewFiles,
  {
    readonly port: number
    readonly urlFor: (
      sessionId: string,
      path: string,
    ) => Effect.Effect<string, SessionNotFound | PreviewFileRefused>
  }
>()("humanity/PreviewFiles") {
  static readonly layer = Layer.effect(
    PreviewFiles,
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      const tokens = new Map<string, string>()
      const bySession = new Map<string, string>()

      const folderOf = (sessionId: string) =>
        Effect.flatMap(repo.get(sessionId), (found) =>
          Option.match(found, {
            onNone: () => Effect.fail(new SessionNotFound({ sessionId })),
            onSome: (session) => Effect.succeed(session.worktreePath),
          }),
        )

      const fileFor = async (folder: string, relativePath: string) => {
        const root = await realpath(folder)
        const file = await realpath(resolve(root, relativePath))
        if (!isInside(root, file)) return undefined
        const info = await stat(file)
        return info.isFile() ? { file, size: info.size } : undefined
      }

      const handle = async (request: IncomingMessage, response: ServerResponse) => {
        const notFound = () => {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
          response.end("Not found")
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { allow: "GET, HEAD" })
          response.end()
          return
        }
        const [token = "", ...segments] = new URL(request.url ?? "/", "http://files").pathname
          .slice(1)
          .split("/")
        const sessionId = tokens.get(token)
        if (sessionId === undefined || segments.length === 0) return notFound()
        const folder = await Effect.runPromise(Effect.option(folderOf(sessionId)))
        if (Option.isNone(folder)) return notFound()
        let relativePath: string
        try {
          relativePath = segments.map(decodeURIComponent).join(sep)
        } catch {
          return notFound()
        }
        const found = await fileFor(folder.value, relativePath).catch(() => undefined)
        if (found === undefined) return notFound()
        response.writeHead(200, {
          "content-type": contentTypeOf(found.file),
          "content-length": found.size,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        })
        if (request.method === "HEAD") return void response.end()
        createReadStream(found.file)
          .on("error", () => response.destroy())
          .pipe(response)
      }

      const server = yield* Effect.acquireRelease(
        Effect.callback<ReturnType<typeof createServer>>((resume) => {
          const created = createServer((request, response) => {
            handle(request, response).catch(() => {
              if (!response.headersSent) response.writeHead(500)
              response.end()
            })
          })
          created.listen(0, "127.0.0.1", () => resume(Effect.succeed(created)))
        }),
        (created) =>
          Effect.callback<void>((resume) => {
            created.closeAllConnections()
            created.close(() => resume(Effect.void))
          }),
      )
      const port = (server.address() as AddressInfo).port

      const tokenFor = (sessionId: string) => {
        const existing = bySession.get(sessionId)
        if (existing !== undefined) return existing
        const token = randomBytes(16).toString("hex")
        tokens.set(token, sessionId)
        bySession.set(sessionId, token)
        return token
      }

      const urlFor = (sessionId: string, path: string) =>
        Effect.gen(function* () {
          const folder = yield* folderOf(sessionId)
          if (!isPreviewFile(path)) {
            return yield* new PreviewFileRefused({ path, reason: "only HTML and PDF files open." })
          }
          const located = yield* Effect.tryPromise(async () => {
            const root = await realpath(folder)
            const file = await realpath(resolve(root, path))
            return isInside(root, file) && (await stat(file)).isFile()
              ? relative(root, file)
              : undefined
          }).pipe(Effect.orElseSucceed(() => undefined))
          if (located === undefined) {
            return yield* new PreviewFileRefused({
              path,
              reason: "it is not a file in this thread's folder.",
            })
          }
          const encoded = located.split(sep).map(encodeURIComponent).join("/")
          return `http://127.0.0.1:${port}/${tokenFor(sessionId)}/${encoded}`
        })

      return PreviewFiles.of({ port, urlFor })
    }),
  )
}
