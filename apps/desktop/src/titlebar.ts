export const TITLEBAR_HEIGHT = 48

export interface TitleBarOverlay {
  readonly color: string
  readonly symbolColor: string
  readonly height: number
}

export const titleBarOverlay = (dark: boolean): TitleBarOverlay => ({
  color: "#01000000",
  symbolColor: dark ? "#fafafa" : "#171717",
  height: TITLEBAR_HEIGHT,
})

export const isDarkColor = (color: string | null): boolean | undefined => {
  const hex = color?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (hex === undefined) return undefined
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex
  const [red, green, blue] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255)
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue! < 0.5
}
