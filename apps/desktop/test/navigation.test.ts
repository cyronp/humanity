import { describe, expect, it } from "vitest"
import { appUrl, destinationOf } from "../src/navigation.ts"

const origin = "http://127.0.0.1:7421"

describe("destinationOf", () => {
  it.each([
    [`${origin}/projects/p1/sessions/s1?file=src/app.ts`, "app"],
    [`blob:${origin}/3f0c2a52-7d7e-4b55-9b0a-1f2e3d4c5b6a`, "app"],
    ["about:blank", "app"],
    ["", "app"],
    ["https://github.com/settings/personal-access-tokens/new", "external"],
    ["http://127.0.0.1:7420/", "external"],
    ["http://localhost:7421/", "external"],
    ["mailto:someone@example.com", "external"],
    ["file:///C:/Windows/System32/calc.exe", "blocked"],
    ["javascript:alert(1)", "blocked"],
    ["humanity://anything", "blocked"],
    ["not a url", "blocked"],
  ] as const)("%j is %s", (url, destination) => {
    expect(destinationOf(url, origin)).toBe(destination)
  })
})

describe("appUrl", () => {
  it("carries the token the web app reads on its first load", () => {
    expect(appUrl(origin, "token", "a b/c")).toBe(`${origin}/?token=a%20b%2Fc`)
  })
})
