export interface Attention {
  readonly waiting: number
  readonly errors: number
}

export const NO_ATTENTION: Attention = { waiting: 0, errors: 0 }

export const attentionOf = (sessions: ReadonlyArray<{ readonly status: string }>): Attention => ({
  waiting: sessions.filter((session) => session.status === "waiting_for_human").length,
  errors: sessions.filter((session) => session.status === "error").length,
})

export const attentionTotal = (attention: Attention): number => attention.waiting + attention.errors

export const sameAttention = (a: Attention, b: Attention): boolean =>
  a.waiting === b.waiting && a.errors === b.errors

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export const attentionLabel = (attention: Attention): string => {
  const parts = [
    attention.waiting > 0
      ? plural(attention.waiting, "thread waits for you", "threads wait for you")
      : "",
    attention.errors > 0
      ? plural(attention.errors, "thread stopped on an error", "threads stopped on an error")
      : "",
  ].filter((part) => part !== "")
  return parts.join(", ")
}

export const BADGE_SIZE = 32

const GLYPHS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "+": ["000", "010", "111", "010", "000"],
}

const WAITING_COLOR = [0xd9, 0x77, 0x06] as const
const ERROR_COLOR = [0xe5, 0x48, 0x4d] as const

export const badgeText = (count: number): string => (count > 9 ? "9+" : String(count))

export const badgeBitmap = (attention: Attention): Buffer => {
  const [red, green, blue] = attention.errors > 0 ? ERROR_COLOR : WAITING_COLOR
  const pixels = Buffer.alloc(BADGE_SIZE * BADGE_SIZE * 4)
  const center = (BADGE_SIZE - 1) / 2
  const radius = BADGE_SIZE / 2
  const paint = (x: number, y: number, color: readonly [number, number, number], alpha: number) => {
    const at = (y * BADGE_SIZE + x) * 4
    pixels[at] = color[2]
    pixels[at + 1] = color[1]
    pixels[at + 2] = color[0]
    pixels[at + 3] = Math.round(alpha * 255)
  }
  for (let y = 0; y < BADGE_SIZE; y++) {
    for (let x = 0; x < BADGE_SIZE; x++) {
      const coverage = Math.min(1, Math.max(0, radius - Math.hypot(x - center, y - center)))
      if (coverage > 0) paint(x, y, [red, green, blue], coverage)
    }
  }
  const text = badgeText(attentionTotal(attention))
  const scale = text.length === 1 ? 4 : 3
  const width = (text.length * 4 - 1) * scale
  const height = 5 * scale
  const left = Math.round((BADGE_SIZE - width) / 2)
  const top = Math.round((BADGE_SIZE - height) / 2)
  ;[...text].forEach((character, index) => {
    const glyph = GLYPHS[character] ?? []
    glyph.forEach((row, glyphY) => {
      ;[...row].forEach((cell, glyphX) => {
        if (cell !== "1") return
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = left + (index * 4 + glyphX) * scale + dx
            const y = top + glyphY * scale + dy
            paint(x, y, [0xff, 0xff, 0xff], 1)
          }
        }
      })
    })
  })
  return pixels
}
