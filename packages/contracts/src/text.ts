export const trimTrailing = (text: string, characters: string): string => {
  let end = text.length
  while (end > 0 && characters.includes(text[end - 1]!)) end--
  return text.slice(0, end)
}

export const trimCharacters = (text: string, characters: string): string => {
  let start = 0
  while (start < text.length && characters.includes(text[start]!)) start++
  return trimTrailing(text.slice(start), characters)
}

export const plural = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`
