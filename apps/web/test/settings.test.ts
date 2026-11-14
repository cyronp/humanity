import { describe, expect, it } from "vitest"
import { matchSections, SECTION_GROUPS, SETTINGS_SECTIONS } from "@/features/settings/settings"

describe("matchSections", () => {
  it("shows every section for an empty or blank search", () => {
    expect(matchSections("")).toEqual(SETTINGS_SECTIONS)
    expect(matchSections("   ")).toEqual(SETTINGS_SECTIONS)
  })

  it("finds a section by its name, whatever the case", () => {
    expect(matchSections("PROV")).toEqual(["providers"])
    expect(matchSections("dark mode")).toEqual(["general"])
    expect(matchSections("nightly")).toEqual(["updates"])
    expect(matchSections("onboarding")).toEqual(["about"])
  })

  it("finds a section by what it holds", () => {
    expect(matchSections("account")).toEqual(["providers"])
    expect(matchSections(" api key ")).toEqual(["providers"])
    expect(matchSections("github")).toEqual(["repositories"])
    expect(matchSections("permissions")).toEqual(["projects"])
    expect(matchSections("sign in")).toEqual(["providers", "repositories"])
    expect(matchSections("model context")).toEqual(["mcp"])
    expect(matchSections("slash commands")).toEqual(["skills"])
    expect(matchSections("extensions")).toEqual(["mcp", "skills"])
  })

  it("shows nothing when no section matches", () => {
    expect(matchSections("billing")).toEqual([])
  })
})

describe("SECTION_GROUPS", () => {
  it("holds every section once, in the order of SETTINGS_SECTIONS", () => {
    expect(SECTION_GROUPS.flatMap((group) => group.sections)).toEqual(SETTINGS_SECTIONS)
  })
})
