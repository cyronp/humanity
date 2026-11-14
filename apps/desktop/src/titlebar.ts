/** As tall as the web app's own bars along the top (`h-12`). */
export const TITLEBAR_HEIGHT = 48

export interface TitleBarOverlay {
  readonly color: string
  readonly symbolColor: string
  readonly height: number
}

/**
 * The window buttons drawn over the page's top right corner. Their background
 * is see-through, so they sit on whatever the page shows there; only the
 * symbols need to know whether that is dark or light.
 */
export const titleBarOverlay = (dark: boolean): TitleBarOverlay => ({
  // Fully transparent is not reliable on every platform; one step from it is.
  color: "#01000000",
  symbolColor: dark ? "#fafafa" : "#171717",
  height: TITLEBAR_HEIGHT,
})

/**
 * Whether a page's `theme-color` (`#rgb` or `#rrggbb`) is a dark one.
 * `undefined` for anything else, so the caller keeps what it had.
 */
export const isDarkColor = (color: string | null): boolean | undefined => {
  const hex = color?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (hex === undefined) return undefined
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex
  const [red, green, blue] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255)
  // Perceived brightness; the halfway point splits dark themes from light ones.
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue! < 0.5
}
