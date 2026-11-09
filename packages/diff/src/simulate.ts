/**
 * Pure simulations of the agent's file-mutating tools: given the current file
 * content and a tool input, compute the content the tool would produce. This
 * is what lets a change be reviewed before anything touches disk.
 */

export type Simulation =
  { readonly ok: true; readonly content: string } | { readonly ok: false; readonly reason: string }

export interface EditInput {
  readonly old_string: string
  readonly new_string: string
  readonly replace_all?: boolean | undefined
}

const fail = (reason: string): Simulation => ({ ok: false, reason })

const usesCrlf = (content: string) => content.includes("\r\n")
const toLf = (text: string) => text.replace(/\r\n/g, "\n")
const toCrlf = (text: string) => toLf(text).replace(/\n/g, "\r\n")

const countOccurrences = (haystack: string, needle: string) => {
  let count = 0
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    count++
  }
  return count
}

/**
 * `Edit`: replace `old_string` with `new_string`. Like the real tool it fails
 * when `old_string` is missing, or ambiguous without `replace_all`.
 *
 * The model reads files with `\n` line endings even when the file on disk uses
 * `\r\n`, so matching is done on normalized text and the file's own line
 * endings are restored afterwards.
 */
export const simulateEdit = (original: string, input: EditInput): Simulation => {
  const { old_string, new_string } = input
  if (old_string === new_string) {
    return fail("old_string and new_string are identical, so the edit would change nothing.")
  }
  if (old_string === "") {
    return original === ""
      ? { ok: true, content: new_string }
      : fail("old_string is empty but the file already has content. Use Write to replace a file.")
  }

  const crlf = usesCrlf(original)
  const source = crlf ? toLf(original) : original
  const search = crlf ? toLf(old_string) : old_string
  const replacement = crlf ? toLf(new_string) : new_string

  const occurrences = countOccurrences(source, search)
  if (occurrences === 0) {
    return fail("old_string was not found in the file. Re-read the file and match it exactly.")
  }
  if (occurrences > 1 && input.replace_all !== true) {
    return fail(
      `old_string matches ${occurrences} places in the file. Add surrounding context to make it unique, or set replace_all.`,
    )
  }

  // split/join and a replacer function both avoid `$&`-style patterns in new_string.
  const edited =
    input.replace_all === true
      ? source.split(search).join(replacement)
      : source.replace(search, () => replacement)
  return { ok: true, content: crlf ? toCrlf(edited) : edited }
}

/** `Write`: the file becomes exactly the given content. */
export const simulateWrite = (input: { readonly content: string }): Simulation => ({
  ok: true,
  content: input.content,
})
