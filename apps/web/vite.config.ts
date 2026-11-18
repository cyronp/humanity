import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const daemonPort = process.env["HUMANITY_PORT"] ?? "7420"

const { version } = JSON.parse(readFileSync(fromHere("../desktop/package.json"), "utf8")) as {
  readonly version: string
}

export default defineConfig({
  define: {
    __HUMANITY_VERSION__: JSON.stringify(version),
    __HUMANITY_DEV_DAEMON__: JSON.stringify(`127.0.0.1:${daemonPort}`),
  },
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fromHere("./src"),
      "@humanity/contracts": fromHere("../../packages/contracts/src/index.ts"),
      "@humanity/diff": fromHere("../../packages/diff/src/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/rpc": { target: `ws://127.0.0.1:${daemonPort}`, ws: true },
      "/api": { target: `http://127.0.0.1:${daemonPort}` },
    },
  },
})
