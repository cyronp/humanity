import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const workspace = (path: string) =>
  fileURLToPath(new URL(`../../packages/${path}`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@humanity/contracts": workspace("contracts/src/index.ts"),
      "@humanity/diff": workspace("diff/src/index.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
  },
})
