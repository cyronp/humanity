import { expect, it } from "vitest"
import { packageName } from "../src/index.ts"

it("exposes the package", () => {
  expect(packageName).toBe("@humanity/diff")
})
