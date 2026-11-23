import { describe, expect, it } from "vitest"
import {
  attentionLabel,
  attentionOf,
  attentionTotal,
  BADGE_SIZE,
  badgeBitmap,
  badgeText,
} from "../src/attention.ts"

const pixel = (bitmap: Buffer, x: number, y: number) => {
  const at = (y * BADGE_SIZE + x) * 4
  return { b: bitmap[at], g: bitmap[at + 1], r: bitmap[at + 2], a: bitmap[at + 3] }
}

describe("attentionOf", () => {
  it("counts the threads that wait for the human and those stopped on an error", () => {
    const attention = attentionOf([
      { status: "waiting_for_human" },
      { status: "running" },
      { status: "error" },
      { status: "waiting_for_human" },
      { status: "ended" },
    ])
    expect(attention).toEqual({ waiting: 2, errors: 1 })
    expect(attentionTotal(attention)).toBe(3)
  })

  it("names both counts for the taskbar's description", () => {
    expect(attentionLabel({ waiting: 1, errors: 0 })).toBe("1 thread waits for you")
    expect(attentionLabel({ waiting: 2, errors: 1 })).toBe(
      "2 threads wait for you, 1 thread stopped on an error",
    )
    expect(attentionLabel({ waiting: 0, errors: 0 })).toBe("")
  })
})

describe("badgeBitmap", () => {
  it("is a round badge with its count in white, transparent in the corners", () => {
    const bitmap = badgeBitmap({ waiting: 1, errors: 0 })
    expect(bitmap.length).toBe(BADGE_SIZE * BADGE_SIZE * 4)
    expect(pixel(bitmap, 0, 0).a).toBe(0)
    expect(pixel(bitmap, 16, 16)).toEqual({ r: 255, g: 255, b: 255, a: 255 })
    expect(pixel(bitmap, 4, 16)).toMatchObject({ r: 0xd9, a: 255 })
  })

  it("turns red when a thread stopped on an error", () => {
    expect(pixel(badgeBitmap({ waiting: 1, errors: 1 }), 4, 16)).toMatchObject({ r: 0xe5 })
  })

  it("caps the count it draws", () => {
    expect(badgeText(3)).toBe("3")
    expect(badgeText(12)).toBe("9+")
  })
})
