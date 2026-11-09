import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const daemonPort = process.env["HUMANITY_PORT"] ?? "7420"

export default defineConfig({
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
      // The RPC WebSocket is served by the daemon; the dev server only forwards it.
      "/rpc": { target: `ws://127.0.0.1:${daemonPort}`, ws: true },
      "/api": { target: `http://127.0.0.1:${daemonPort}` },
    },
  },
})
