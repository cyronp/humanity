import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": fromHere("./src"),
      "@humanity/contracts": fromHere("../../packages/contracts/src/index.ts"),
      "@humanity/diff": fromHere("../../packages/diff/src/index.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
  },
})
