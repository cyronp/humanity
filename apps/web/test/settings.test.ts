import { describe, expect, it } from "vitest"
import { matchSections, SETTINGS_SECTIONS } from "@/features/settings/settings"

describe("matchSections", () => {
  it("shows every section for an empty or blank search", () => {
    expect(matchSections("")).toEqual(SETTINGS_SECTIONS)
    expect(matchSections("   ")).toEqual(SETTINGS_SECTIONS)
  })

  it("finds a section by its name, whatever the case", () => {
    expect(matchSections("PROV")).toEqual(["providers"])
  })

  it("finds a section by what it holds", () => {
    expect(matchSections("account")).toEqual(["providers"])
    expect(matchSections(" api key ")).toEqual(["providers"])
    expect(matchSections("github")).toEqual(["repositories"])
    expect(matchSections("policy")).toEqual(["projects"])
    expect(matchSections("sign in")).toEqual(["providers", "repositories"])
  })

  it("shows nothing when no section matches", () => {
    expect(matchSections("billing")).toEqual([])
  })
})
