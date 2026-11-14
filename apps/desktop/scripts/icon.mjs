// Draws the app icon, `build/icon.png`, from the brand mark the web app uses as
// its favicon: the same 24×24 cells, enlarged without smoothing. Run it again
// with `npm run icon` when the mark changes; the result is committed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { crc32, deflateSync } from "node:zlib"

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const source = here("../../web/public/favicon.svg")
const target = here("../build/icon.png")

const GRID = 24
const CELL = 20
const SIZE = 512
const MARGIN = (SIZE - GRID * CELL) / 2
// Tailwind's blue-500, the favicon's `oklch(62.3% 0.214 259.815)`, in sRGB.
const [RED, GREEN, BLUE] = [0x2b, 0x7f, 0xff]

// Each path is a run of `M<x> <y>h<width>v1h-<width>z` rows, one opacity per path.
const alpha = new Uint8Array(GRID * GRID)
const svg = readFileSync(source, "utf8")
for (const [, attributes] of svg.matchAll(/<path([^>]*)\/>/g)) {
  const opacity = Number(attributes.match(/fill-opacity="([^"]+)"/)?.[1] ?? 1)
  const d = attributes.match(/ d="([^"]+)"/)?.[1] ?? ""
  for (const [, x, y, width] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let column = Number(x); column < Number(x) + Number(width); column++) {
      alpha[Number(y) * GRID + column] = Math.round(opacity * 255)
    }
  }
}
if (!alpha.some((value) => value > 0)) throw new Error(`No cells found in ${source}`)

// One filter byte, then RGBA, per row.
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const column = Math.floor((x - MARGIN) / CELL)
    const row = Math.floor((y - MARGIN) / CELL)
    const inside = column >= 0 && column < GRID && row >= 0 && row < GRID
    const at = y * (1 + SIZE * 4) + 1 + x * 4
    raw[at] = RED
    raw[at + 1] = GREEN
    raw[at + 2] = BLUE
    raw[at + 3] = inside ? alpha[row * GRID + column] : 0
  }
}

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header.set([8, 6, 0, 0, 0], 8) // 8 bits per channel, RGBA

mkdirSync(dirname(target), { recursive: true })
writeFileSync(
  target,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]),
)
console.log(`Wrote ${target}`)
